import { db } from "@/db";
import { seenTopics } from "@/db/schema";
import type { Topic } from "./discovery";
import type { PersonaConfig } from "./persona";
import { personaSystemPrompt, rejectRulesPrompt } from "./persona";
import {
  BATCH_JUDGMENT_SCHEMA,
  generateStructured,
  type BatchJudgmentOutput,
  type BatchCandidateDecision,
} from "./gemini";

// ─── Types ────────────────────────────────────────────────────────────────────

export type JudgmentDecision = "publish" | "reject";

export interface EvaluatedCandidate {
  candidate: Topic;
  decision: JudgmentDecision;
  score: number;
  reason: string;
}

export interface BatchJudgmentResult {
  status: "success" | "error";
  evaluated: EvaluatedCandidate[];
  error?: string;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateBatchOutput(
  raw: unknown,
  candidateCount: number
): BatchJudgmentOutput {
  if (!raw || typeof raw !== "object") {
    throw new Error("Gemini returned a non-object batch judgment response");
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.decisions)) {
    throw new Error("Gemini output missing 'decisions' array");
  }

  const validDecisions: BatchCandidateDecision[] = [];
  for (const item of obj.decisions) {
    if (!item || typeof item !== "object") continue;
    const d = item as Record<string, unknown>;

    const idx =
      typeof d.candidateIndex === "number" ? Math.floor(d.candidateIndex) : -1;
    if (idx < 0 || idx >= candidateCount) continue;

    const decision: JudgmentDecision =
      d.decision === "publish" || d.decision === "reject"
        ? (d.decision as JudgmentDecision)
        : "reject";
    const score =
      typeof d.score === "number" && d.score >= 0 && d.score <= 100
        ? Math.round(d.score)
        : 0;
    const reason =
      typeof d.reason === "string" && d.reason.trim().length > 0
        ? d.reason.trim()
        : "No reason provided";

    validDecisions.push({
      candidateIndex: idx,
      decision,
      score,
      reason,
    });
  }

  return { decisions: validDecisions };
}

// ─── Batch Editorial Judgment ────────────────────────────────────────────────

/**
 * Judge a batch of 3-5 candidates in a SINGLE Gemini API request.
 *
 * Successful decisions are persisted to seen_topics.
 * If Gemini fails (429, timeout, network failure), NO candidates are marked in DB,
 * allowing them to be preserved and retried on a future tick.
 *
 * @param candidates Array of 3-5 pre-filtered unseen candidates
 * @param persona    Mira Voss's full persona config
 * @param agentId    UUID of the agent
 */
export async function judgeCandidateBatch(
  candidates: Topic[],
  persona: PersonaConfig,
  agentId: string
): Promise<BatchJudgmentResult> {
  if (candidates.length === 0) {
    return { status: "success", evaluated: [] };
  }

  console.log(
    `[Judge] Evaluating ${candidates.length} candidates in one Gemini request`
  );

  const formattedCandidates = candidates
    .map(
      (c, i) =>
        `Candidate [${i}]:\nTitle: ${c.title}\nSource: ${c.source}\nPublished: ${c.publishedAt}\nURL: ${c.url}\nSummary: ${c.summary}`
    )
    .join("\n\n");

  const systemInstruction = `${personaSystemPrompt(persona)}

You are acting as the editorial filter for ${persona.name}'s AI security research feed.

REJECTION RULES — reject a candidate if ANY of these apply:
${rejectRulesPrompt(persona)}

SCORING GUIDE:
- 0–30:  Off-domain, pure marketing, or lacking technical substance → REJECT
- 31–59: Marginally relevant but insufficient depth or novelty → REJECT
- 60–79: Solid technical relevance with meaningful security angle → PUBLISH
- 80–100: High-value, novel, technically rich AI security finding → MUST PUBLISH

Evaluate each candidate independently by its index (0 to ${candidates.length - 1}).
Only assign decision="publish" when score >= 60. Provide a concise reason for each candidate.`;

  const userContent = `Evaluate these ${candidates.length} candidates for ${persona.name}'s AI security research feed:

${formattedCandidates}

Return structured editorial judgments for all ${candidates.length} candidates.`;

  let batchOutput: BatchJudgmentOutput;

  try {
    const raw = await generateStructured<BatchJudgmentOutput>({
      systemInstruction,
      userContent,
      schema: BATCH_JUDGMENT_SCHEMA,
      temperature: 0.2,
    });

    batchOutput = validateBatchOutput(raw, candidates.length);
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err);
    console.error(
      `[Judge] Gemini unavailable — preserving candidates for future retry (${errMessage.slice(0, 100)})`
    );
    return {
      status: "error",
      evaluated: [],
      error: errMessage,
    };
  }

  // Process and log valid judgments
  const evaluatedResults: EvaluatedCandidate[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const itemDecision = batchOutput.decisions.find(
      (d) => d.candidateIndex === i
    );

    let finalDecision: JudgmentDecision = "reject";
    let score = 0;
    let reason = "Omitted by judge response";

    if (itemDecision) {
      score = itemDecision.score;
      finalDecision =
        score >= 60 && itemDecision.decision === "publish"
          ? "publish"
          : "reject";
      reason =
        finalDecision !== itemDecision.decision
          ? `Score ${score}/100 below threshold (60): ${itemDecision.reason}`
          : itemDecision.reason;
    }

    // Required log format: [Judge] Candidate X: PUBLISH/REJECT score/100
    console.log(
      `[Judge] Candidate ${i + 1}: ${finalDecision.toUpperCase()} ${score}/100 — "${candidate.title.slice(0, 60)}"`
    );

    // Save successful judgment decision to seen_topics DB table
    try {
      await db.insert(seenTopics).values({
        agentId,
        topicKey: candidate.topicKey,
        title: candidate.title,
        sourceUrl: candidate.url,
        published: finalDecision === "publish",
        decisionReason: `[${score}/100] ${reason}`,
        decidedAt: new Date(),
      });
    } catch (dbErr) {
      console.warn(
        `[Judge] seen_topics insert skipped for key "${candidate.topicKey}":`,
        (dbErr as Error).message?.slice(0, 100)
      );
    }

    evaluatedResults.push({
      candidate,
      decision: finalDecision,
      score,
      reason,
    });
  }

  return {
    status: "success",
    evaluated: evaluatedResults,
  };
}
