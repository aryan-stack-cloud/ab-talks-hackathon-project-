import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import { posts } from "@/db/schema";
import type { Topic } from "./discovery";
import type { PersonaConfig } from "./persona";
import { personaSystemPrompt } from "./persona";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GeneratedPost {
  text: string;
  rationale: string;
  sources: string[];
}

// ─── Anthropic client (re-use singleton pattern) ─────────────────────────────

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// ─── Post generation ──────────────────────────────────────────────────────────

/**
 * Generate a post for an accepted topic and insert it into the posts table.
 *
 * The recent rejections are passed as context so CIPHER can acknowledge
 * why it chose this topic over alternatives — making the rationale richer.
 *
 * @param candidate        - The topic to write about (editorial decision: "publish")
 * @param persona          - CIPHER's persona config
 * @param agentId          - UUID of the agent writing the post
 * @param recentRejections - Other topics evaluated this tick that were rejected
 * @returns The generated post metadata (text, rationale, sources)
 */
export async function generatePost(
  candidate: Topic,
  persona: PersonaConfig,
  agentId: string,
  recentRejections: Topic[] = []
): Promise<GeneratedPost> {
  const client = getClient();

  const rejectionsContext =
    recentRejections.length > 0
      ? `\n\nOTHER TOPICS EVALUATED AND REJECTED THIS CYCLE:\n${recentRejections
          .map((r, i) => `${i + 1}. "${r.title}" (${r.source}) — rejected`)
          .join("\n")}\nYou may reference why you chose this topic over those alternatives if it strengthens the rationale.`
      : "";

  const systemPrompt = `${personaSystemPrompt(persona)}

You are now writing a post as ${persona.name}. This post has already passed your editorial judgment and will be published.

WRITING CONSTRAINTS:
- Maximum 280 words — count carefully
- Write in first person as ${persona.name}
- Every factual claim must cite its source inline
- No hashtags, no emoji, no bullet lists in the post body
- End with a bare source URL on its own line if you cite an external source

Respond ONLY with valid JSON in exactly this shape:
{
  "text": "<the full post text, max 280 words>",
  "rationale": "<2-3 sentences explaining why you chose to write about this and what angle you took>",
  "sources": ["<url1>", "<url2>"]
}

Do not include any text outside the JSON object.`;

  const userPrompt = `Write a post about this topic:

Title: ${candidate.title}
URL: ${candidate.url}
Source: ${candidate.source}
Published: ${candidate.publishedAt}
Summary: ${candidate.summary}
${rejectionsContext}

Write the post now.`;

  let generated: GeneratedPost;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected non-text response from Anthropic");
    }

    const jsonText = content.text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/```\s*$/, "");

    const parsed = JSON.parse(jsonText) as {
      text: string;
      rationale: string;
      sources: string[];
    };

    generated = {
      text: parsed.text ?? "",
      rationale: parsed.rationale ?? "",
      sources: Array.isArray(parsed.sources) ? parsed.sources : [candidate.url],
    };

    // Ensure the source URL is always in the sources list
    if (!generated.sources.includes(candidate.url)) {
      generated.sources.unshift(candidate.url);
    }
  } catch (err) {
    console.error(`[Writer] Post generation failed for "${candidate.title}":`, err);
    throw err; // Re-throw — caller handles this gracefully
  }

  // ── Insert into posts table ───────────────────────────────────────────────
  try {
    await db.insert(posts).values({
      agentId,
      text: generated.text,
      rationale: generated.rationale,
      sources: generated.sources,
      createdAt: new Date(),
    });

    console.log(
      `[Writer] Post published — "${candidate.title}" (${generated.text.split(" ").length} words)`
    );
  } catch (dbErr) {
    console.error("[Writer] Failed to insert post into DB:", dbErr);
    throw dbErr;
  }

  return generated;
}
