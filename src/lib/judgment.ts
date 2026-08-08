import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import { seenTopics } from "@/db/schema";
import type { Topic } from "./discovery";
import type { PersonaConfig } from "./persona";
import { personaSystemPrompt } from "./persona";

// ─── Types ────────────────────────────────────────────────────────────────────

export type JudgmentDecision = "publish" | "reject";

export interface JudgmentResult {
  decision: JudgmentDecision;
  reason: string;
}

// ─── Anthropic client ─────────────────────────────────────────────────────────

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

// ─── Judgment ─────────────────────────────────────────────────────────────────

/**
 * Ask CIPHER to judge whether a candidate topic is worth publishing.
 *
 * Every judgment — publish or reject — is logged to seen_topics so the
 * agent never re-evaluates the same topic. The reason is stored as rationale.
 *
 * @param candidate - The topic to evaluate
 * @param persona   - CIPHER's persona config (stances + reject_if rules)
 * @param agentId   - UUID of the agent making the judgment
 * @returns JudgmentResult with decision and reason
 */
export async function judgeTopic(
  candidate: Topic,
  persona: PersonaConfig,
  agentId: string
): Promise<JudgmentResult> {
  const client = getClient();

  const systemPrompt = `${personaSystemPrompt(persona)}

You are now acting as an editorial filter. Your job is to decide whether a given topic is worth writing about as ${persona.name}.

REJECTION CRITERIA — reject if ANY of these are true:
${persona.reject_if.map((r, i) => `${i + 1}. ${r}`).join("\n")}

Respond ONLY with valid JSON in exactly this shape:
{"decision": "publish" | "reject", "reason": "<one concise sentence explaining why>"}

Do not include any text outside the JSON object.`;

  const userPrompt = `Evaluate this topic:

Title: ${candidate.title}
URL: ${candidate.url}
Source: ${candidate.source}
Published: ${candidate.publishedAt}
Summary: ${candidate.summary}

Should ${persona.name} write about this? Respond with the JSON judgment.`;

  let result: JudgmentResult;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 256,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected non-text response from Anthropic");
    }

    // Parse the JSON response — be defensive about extra whitespace/markdown
    const jsonText = content.text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/```\s*$/, "");

    const parsed = JSON.parse(jsonText) as { decision: string; reason: string };

    if (parsed.decision !== "publish" && parsed.decision !== "reject") {
      throw new Error(`Invalid decision value: ${parsed.decision}`);
    }

    result = {
      decision: parsed.decision as JudgmentDecision,
      reason: parsed.reason ?? "No reason provided",
    };
  } catch (err) {
    console.error(`[Judgment] Failed for "${candidate.title}":`, err);
    // On API failure, reject conservatively — don't spam the API on retry
    result = {
      decision: "reject",
      reason: `Judgment failed due to API error: ${String(err).slice(0, 100)}`,
    };
  }

  // ── Log decision to seen_topics (always, regardless of decision) ──────────
  try {
    await db.insert(seenTopics).values({
      agentId,
      topicKey: candidate.topicKey,
      title: candidate.title,
      sourceUrl: candidate.url,
      published: result.decision === "publish",
      rationale: result.reason,
      decidedAt: new Date(),
    });
  } catch (dbErr) {
    // If the row already exists (race condition), ignore — the earlier judgment wins
    console.warn(
      `[Judgment] DB insert skipped for "${candidate.topicKey}" (likely duplicate):`,
      dbErr
    );
  }

  console.log(
    `[Judgment] ${result.decision.toUpperCase()} — "${candidate.title}" | ${result.reason}`
  );

  return result;
}
