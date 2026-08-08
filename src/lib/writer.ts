import { db } from "@/db";
import { posts } from "@/db/schema";
import type { Topic } from "./discovery";
import type { PersonaConfig } from "./persona";
import { personaSystemPrompt } from "./persona";
import { POST_SCHEMA, generateStructured, type PostOutput } from "./gemini";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GeneratedPost {
  text: string;
  rationale: string;
  sources: string[];
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validatePostOutput(raw: unknown, sourceUrl: string): PostOutput {
  if (!raw || typeof raw !== "object") {
    throw new Error("Gemini returned a non-object post response");
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.text !== "string" || obj.text.trim().length < 50) {
    throw new Error(
      `Post text is missing or too short (${String(obj.text ?? "").length} chars — need ≥50)`
    );
  }
  if (typeof obj.rationale !== "string" || obj.rationale.trim().length === 0) {
    throw new Error("Post rationale is missing or empty");
  }

  // Sources: use provided array, filtering non-URL strings; fall back to known URL
  let sources: string[];
  if (Array.isArray(obj.sources) && obj.sources.length > 0) {
    sources = (obj.sources as unknown[])
      .filter((s): s is string => typeof s === "string" && s.startsWith("http"))
      .slice(0, 5);
  } else {
    sources = [];
  }

  // Always ensure the canonical source URL is present
  if (!sources.includes(sourceUrl)) {
    sources = [sourceUrl, ...sources];
  }

  return {
    text: obj.text.trim(),
    rationale: obj.rationale.trim(),
    sources,
  };
}

// ─── Post generation ──────────────────────────────────────────────────────────

/**
 * Generate a post for an accepted topic and insert it into the posts table.
 *
 * Uses Gemini structured JSON output. The output is validated before any
 * DB insert — malformed posts are never persisted.
 *
 * @param candidate         The topic to write about (editorially accepted)
 * @param persona           Mira Voss's full persona config (from DB)
 * @param agentId           UUID of the writing agent
 * @param judgment          The editorial judgment (score + reason, used for context)
 * @param recentRejections  Other topics judged this tick that were rejected
 * @param recentPostSummaries Short summaries of recently published posts (for continuity)
 */
export async function generatePost(
  candidate: Topic,
  persona: PersonaConfig,
  agentId: string,
  judgment: { score: number; reason: string },
  recentRejections: Topic[] = [],
  recentPostSummaries: string[] = [],
  candidateIndex?: number
): Promise<GeneratedPost> {
  const rejectionsContext =
    recentRejections.length > 0
      ? `\nTOPICS EVALUATED AND REJECTED THIS CYCLE (weaker candidates):\n${recentRejections
          .slice(0, 5)
          .map((r, i) => `${i + 1}. "${r.title}" (${r.source})`)
          .join("\n")}\n`
      : "";

  const continuityContext =
    recentPostSummaries.length > 0
      ? `\nRECENT PUBLISHED POSTS (avoid repeating these angles):\n${recentPostSummaries
          .map((s, i) => `${i + 1}. ${s}`)
          .join("\n")}\n`
      : "";

  const systemInstruction = `${personaSystemPrompt(persona)}

You are now writing a research post as ${persona.name}.

This topic passed editorial review with a score of ${judgment.score}/100.
Selection reason: ${judgment.reason}

WRITING REQUIREMENTS:
- Write in ${persona.name}'s voice — technically precise, slightly skeptical, analytical
- Maximum 300 words; prefer 150–250 words
- No hashtags, no emojis, no bullet-point lists in the post body — prose only
- Explain why this topic matters NOW with a concrete technical angle
- Cite only the source URLs provided in the input — never fabricate URLs
- Distinguish your interpretation from what the source actually says
- Do not begin with "I'm excited", "This is huge", or similar openers
- Avoid passive voice where active is possible
- The post must stand alone: a reader who has not seen the source should understand the significance
${rejectionsContext}${continuityContext}`;

  const userContent = `Write a post as ${persona.name} about this topic:

Title: ${candidate.title}
Source: ${candidate.source}
Published: ${candidate.publishedAt}
URL: ${candidate.url}
Summary: ${candidate.summary}

Use only the URL above as your source. Explain the security significance concretely. Write the post now.`;

  let generated: GeneratedPost;

  try {
    const idxLabel = typeof candidateIndex === "number" ? candidateIndex + 1 : "";
    console.log(`[Writer] Generating post for candidate ${idxLabel} ("${candidate.title.slice(0, 50)}")`.trim());

    const raw = await generateStructured<PostOutput>({
      systemInstruction,
      userContent,
      schema: POST_SCHEMA,
      temperature: 0.65, // Some creativity for a distinct, non-robotic voice
    });

    const validated = validatePostOutput(raw, candidate.url);

    generated = {
      text: validated.text,
      rationale: validated.rationale,
      sources: validated.sources,
    };
  } catch (err) {
    console.error(
      `[Writer] Post generation failed for "${candidate.title.slice(0, 70)}":`,
      err
    );
    // Re-throw — the tick caller catches this, counts the error, and continues.
    // A malformed post is NEVER inserted into the database.
    throw new Error(
      `Post generation failed: ${err instanceof Error ? err.message : String(err)}`
    );
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

    const wordCount = generated.text.split(/\s+/).length;
    console.log(
      `[Writer] Post inserted — "${candidate.title.slice(0, 60)}" (${wordCount} words)`
    );
  } catch (dbErr) {
    console.error("[Writer] DB insert failed:", dbErr);
    throw dbErr;
  }

  return generated;
}
