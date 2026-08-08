import { db } from "@/db";
import { agents, posts } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { discoverTopics, prefilterCandidates } from "./discovery";
import { filterUnseen } from "./memory";
import { judgeCandidateBatch, type EvaluatedCandidate } from "./judgment";
import { generatePost } from "./writer";
import type { PersonaConfig } from "./persona";
import type { Topic } from "./discovery";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TickResult {
  agentId: string;
  discovered: number;
  unseen: number;
  prefiltered: number;
  judged: number;
  published: number;
  rejected: number;
  errors: number;
  skippedNoTopics: boolean;
  posts: Array<{ title: string; wordCount: number }>;
}

// ─── Main tick ────────────────────────────────────────────────────────────────

/**
 * One autonomous cycle for Mira Voss:
 *
 * 1. Discover live topics from HN + ArXiv
 * 2. Filter out already-evaluated topics (long-term memory)
 * 3. Local pre-filter to select top 3–5 candidates
 * 4. Single Gemini API call for batch editorial judgment
 * 5. Single Gemini API call for post generation (max 1 post per tick)
 * 6. Persist decisions and posts to database
 *
 * Transient API errors (429, timeouts) DO NOT mark candidates as rejected,
 * preserving them in memory for retry on future ticks.
 *
 * @param agentId UUID of the agent to run
 */
export async function runTick(agentId: string): Promise<TickResult> {
  const tickStart = Date.now();
  console.log(`\n[Tick] ═══ Starting tick for agent ${agentId} ═══`);

  const result: TickResult = {
    agentId,
    discovered: 0,
    unseen: 0,
    prefiltered: 0,
    judged: 0,
    published: 0,
    rejected: 0,
    errors: 0,
    skippedNoTopics: false,
    posts: [],
  };

  // ── Load agent + persona from DB ──────────────────────────────────────────
  let persona: PersonaConfig;

  try {
    const agentRows = await db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    if (agentRows.length === 0) {
      console.error(`[Tick] Agent ${agentId} not found in database`);
      return result;
    }

    persona = agentRows[0].persona as PersonaConfig;
    console.log(`[Tick] Running as persona: ${persona.name}`);
  } catch (err) {
    console.error("[Tick] Failed to load agent from DB:", err);
    return result;
  }

  // ── Fetch recent post summaries for continuity context ──────────────────
  let recentPostSummaries: string[] = [];
  try {
    const recentPosts = await db
      .select({ rationale: posts.rationale })
      .from(posts)
      .where(eq(posts.agentId, agentId))
      .orderBy(desc(posts.createdAt))
      .limit(5);
    recentPostSummaries = recentPosts.map((p) => p.rationale.slice(0, 80));
  } catch {
    // Non-fatal — continuity context is optional
  }

  // ── Step 1: Discover live topics ─────────────────────────────────────────
  let candidates: Topic[] = [];

  try {
    candidates = await discoverTopics();
    result.discovered = candidates.length;
  } catch (err) {
    console.error("[Tick] Discovery failed:", err);
    return result;
  }

  // ── Step 2: Filter against memory ────────────────────────────────────────
  let unseen: Topic[] = [];

  try {
    unseen = await filterUnseen(candidates, agentId);
    result.unseen = unseen.length;
  } catch (err) {
    console.error("[Tick] Memory filter failed:", err);
    return result;
  }

  if (unseen.length === 0) {
    console.log("[Tick] No unseen topics this cycle — nothing to judge");
    result.skippedNoTopics = true;
    return result;
  }

  // ── Step 3: Local pre-filter (select 3-5 strongest candidates) ───────────
  const prefiltered = prefilterCandidates(unseen, 5);
  result.prefiltered = prefiltered.length;

  if (prefiltered.length === 0) {
    console.log("[Tick] No candidates passed local pre-filter");
    result.skippedNoTopics = true;
    return result;
  }

  // ── Step 4: Batch Editorial Judgment (1 Gemini API request) ─────────────
  const batchResult = await judgeCandidateBatch(prefiltered, persona, agentId);

  if (batchResult.status === "error") {
    console.error(
      `[Tick] Batch judgment failed due to Gemini error — preserving candidates for future retry`
    );
    result.errors++;
    return result;
  }

  const evaluated = batchResult.evaluated;
  result.judged = evaluated.length;

  const rejectedCandidates: Topic[] = [];
  const publishableMatches: EvaluatedCandidate[] = [];

  for (const item of evaluated) {
    if (item.decision === "publish" && item.score >= 60) {
      publishableMatches.push(item);
    } else {
      rejectedCandidates.push(item.candidate);
      result.rejected++;
    }
  }

  if (publishableMatches.length === 0) {
    console.log("[Tick] Published 0 posts");
    return result;
  }

  // Sort publishable matches by score descending (highest quality candidate first)
  publishableMatches.sort((a, b) => b.score - a.score);
  const winner = publishableMatches[0];

  // ── Step 5: Post Generation (Max 1 post per tick, 1 Gemini API request) ──
  const winnerIndex = prefiltered.findIndex(
    (c) => c.topicKey === winner.candidate.topicKey
  );

  try {
    const post = await generatePost(
      winner.candidate,
      persona,
      agentId,
      { score: winner.score, reason: winner.reason },
      rejectedCandidates,
      recentPostSummaries,
      winnerIndex >= 0 ? winnerIndex : 0
    );

    result.published = 1;
    result.posts.push({
      title: winner.candidate.title,
      wordCount: post.text.split(/\s+/).length,
    });

    console.log(`[Tick] Published 1 post`);
  } catch (err) {
    console.error(
      `[Tick] Post generation failed for "${winner.candidate.title.slice(0, 60)}":`,
      err
    );
    result.errors++;
  }

  const elapsed = ((Date.now() - tickStart) / 1000).toFixed(1);
  console.log(
    `[Tick] ═══ Complete in ${elapsed}s: ${result.published} post published, ${result.rejected} rejected ═══\n`
  );

  return result;
}

// ─── All-agents runner ────────────────────────────────────────────────────────

/**
 * Run ticks for ALL agents in the database.
 * Used by the cron endpoint when no specific agentId is provided.
 * Runs agents sequentially to avoid rate limit collisions.
 */
export async function runTickForAllAgents(): Promise<TickResult[]> {
  let allAgents: { id: string }[] = [];

  try {
    allAgents = await db.select({ id: agents.id }).from(agents);
  } catch (err) {
    console.error("[Tick] Failed to query agents table:", err);
    return [];
  }

  console.log(`[Tick] Running tick for ${allAgents.length} agent(s)`);

  const results: TickResult[] = [];

  for (const agent of allAgents) {
    try {
      const tickResult = await runTick(agent.id);
      results.push(tickResult);
    } catch (err) {
      console.error(`[Tick] Unhandled error for agent ${agent.id}:`, err);
    }
  }

  return results;
}
