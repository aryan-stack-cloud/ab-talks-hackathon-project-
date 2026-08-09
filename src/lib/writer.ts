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

  const headline = typeof obj.headline === "string" ? obj.headline.trim() : "";
  const takeaway = typeof obj.takeaway === "string" ? obj.takeaway.trim() : "";
  const bodyText = typeof obj.text === "string" ? obj.text.trim() : "";
  const rationale = typeof obj.rationale === "string" ? obj.rationale.trim() : "";

  if (!headline && !bodyText) {
    throw new Error("Post headline and body text are missing");
  }
  if (!rationale) {
    throw new Error("Post rationale is missing or empty");
  }

  const keyPoints = Array.isArray(obj.keyPoints)
    ? (obj.keyPoints as unknown[]).filter((k): k is string => typeof k === "string" && k.trim().length > 0)
    : [];

  let sources: string[];
  if (Array.isArray(obj.sources) && obj.sources.length > 0) {
    sources = (obj.sources as unknown[])
      .filter((s): s is string => typeof s === "string" && s.startsWith("http"))
      .slice(0, 5);
  } else {
    sources = [];
  }

  if (!sources.includes(sourceUrl)) {
    sources = [sourceUrl, ...sources];
  }

  return {
    headline: headline || "AI Security Intelligence Update",
    takeaway: takeaway || headline,
    keyPoints,
    text: bodyText,
    rationale,
    sources,
  };
}

// ─── Post generation ──────────────────────────────────────────────────────────

/**
 * Generate a structured news outlet article post for an accepted topic and insert it into DB.
 * Output is validated before DB insert — malformed posts are never persisted.
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

You are writing a structured, highly readable research article for ${persona.name}'s AI security publication.

This topic passed editorial review with a score of ${judgment.score}/100.
Selection reason: ${judgment.reason}

STRUCTURE REQUIREMENTS:
1. "headline": Create a bold, compelling, modern news headline (under 12 words).
2. "takeaway": One executive summary sentence highlighting the core security risk or discovery.
3. "keyPoints": 2–3 concise bullet takeaways explaining threat implications or technical findings.
4. "text": 2–3 short, clear, well-spaced analytical paragraphs written in ${persona.name}'s voice.
5. "rationale": 2–3 sentences explaining why this topic was selected and what angle was taken.
6. "sources": Include the provided URL.

WRITING CONSTRAINTS:
- No generic hype or marketing buzzwords ("groundbreaking", "revolutionary", "I'm excited")
- No emojis, no hashtags
- Cite the source URL inline or at the end
- Professional, clean, easy to read for researchers and engineers
${rejectionsContext}${continuityContext}`;

  const userContent = `Write a structured research article as ${persona.name} for this source:

Source Outlet: ${candidate.source}
Title: ${candidate.title}
Published: ${candidate.publishedAt}
URL: ${candidate.url}
Summary: ${candidate.summary}

Write the structured article now.`;

  let validated: PostOutput;

  try {
    const idxLabel = typeof candidateIndex === "number" ? candidateIndex + 1 : "";
    console.log(
      `[Writer] Generating post for candidate ${idxLabel} ("${candidate.title.slice(0, 50)}")`.trim()
    );

    const raw = await generateStructured<PostOutput>({
      systemInstruction,
      userContent,
      schema: POST_SCHEMA,
      temperature: 0.65,
    });

    validated = validatePostOutput(raw, candidate.url);
  } catch (err) {
    console.error(
      `[Writer] Post generation failed for "${candidate.title.slice(0, 70)}":`,
      err
    );
    throw new Error(
      `Post generation failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Format payload as JSON string so UI can parse headline, takeaway, keyPoints, body paragraphs, and featured image!
  const formattedPayload = JSON.stringify({
    headline: validated.headline,
    takeaway: validated.takeaway,
    keyPoints: validated.keyPoints,
    body: validated.text,
    sourceName: candidate.source,
    imageUrl: candidate.imageUrl,
  });

  // ── Insert into posts table ───────────────────────────────────────────────
  try {
    await db.insert(posts).values({
      agentId,
      text: formattedPayload,
      rationale: validated.rationale,
      sources: validated.sources,
      createdAt: new Date(),
    });

    const wordCount = validated.text.split(/\s+/).length;
    console.log(
      `[Writer] Structured post inserted — "${validated.headline}" (${wordCount} words)`
    );
  } catch (dbErr) {
    console.error("[Writer] DB insert failed:", dbErr);
    throw dbErr;
  }

  return {
    text: formattedPayload,
    rationale: validated.rationale,
    sources: validated.sources,
  };
}
