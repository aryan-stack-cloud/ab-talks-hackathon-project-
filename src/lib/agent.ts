import { db } from "@/db";
import { agents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { discoverTopics } from "./discovery";
import { filterUnseen } from "./memory";
import { judgeTopic } from "./judgment";
import { generatePost } from "./writer";
import type { PersonaConfig } from "./persona";
import type { Topic } from "./discovery";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TickResult {
  agentId: string;
  discovered: number;
  unseen: number;
  judged: number;
  published: number;
  rejected: number;
  errors: number;
  posts: Array<{ title: string; wordCount: number }>;
}

// ─── Main tick ────────────────────────────────────────────────────────────────

/**
 * One autonomous cycle for a given agent:
 * 1. Discover topics from HN + ArXiv
 * 2. Filter out already-seen topics (memory)
 * 3. Judge each unseen candidate (editorial filter)
 * 4. Generate + publish posts for accepted topics
 *
 * Handles "no accepted topics" gracefully — returns a valid TickResult
 * with published=0. Never throws; individual step errors are caught and counted.
 *
 * @param agentId - UUID of the agent to run
 * @returns Summary of what happened this tick
 */
export async function runTick(agentId: string): Promise<TickResult> {
  console.log(`\n[Tick] ═══ Starting tick for agent ${agentId} ═══`);

  const result: TickResult = {
    agentId,
    discovered: 0,
    unseen: 0,
    judged: 0,
    published: 0,
    rejected: 0,
    errors: 0,
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
      console.error(`[Tick] Agent ${agentId} not found`);
      return result;
    }

    persona = agentRows[0].persona as PersonaConfig;
  } catch (err) {
    console.error("[Tick] Failed to load agent:", err);
    return result;
  }

  // ── Step 1: Discover ──────────────────────────────────────────────────────
  let candidates: Topic[] = [];

  try {
    candidates = await discoverTopics();
    result.discovered = candidates.length;
    console.log(`[Tick] Discovered ${candidates.length} topics`);
  } catch (err) {
    console.error("[Tick] Discovery failed:", err);
    return result;
  }

  // ── Step 2: Filter unseen ─────────────────────────────────────────────────
  let unseen: Topic[] = [];

  try {
    unseen = await filterUnseen(candidates, agentId);
    result.unseen = unseen.length;
  } catch (err) {
    console.error("[Tick] Memory filter failed:", err);
    return result;
  }

  if (unseen.length === 0) {
    console.log("[Tick] No unseen topics this cycle — nothing to do");
    return result;
  }

  // ── Step 3: Judge each candidate ──────────────────────────────────────────
  // Limit to 8 judgments per tick to control LLM cost
  const toJudge = unseen.slice(0, 8);
  const accepted: Topic[] = [];
  const rejected: Topic[] = [];

  for (const candidate of toJudge) {
    try {
      const judgment = await judgeTopic(candidate, persona, agentId);
      result.judged++;

      if (judgment.decision === "publish") {
        accepted.push(candidate);
      } else {
        rejected.push(candidate);
        result.rejected++;
      }
    } catch (err) {
      console.error(`[Tick] Judgment error for "${candidate.title}":`, err);
      result.errors++;
    }
  }

  console.log(
    `[Tick] Judged ${result.judged}: ${accepted.length} accepted, ${rejected.length} rejected`
  );

  if (accepted.length === 0) {
    console.log("[Tick] No topics accepted for publishing this cycle");
    return result;
  }

  // ── Step 4: Generate posts for accepted topics ────────────────────────────
  // Limit to 2 posts per tick to avoid rate limits and maintain quality
  const toPublish = accepted.slice(0, 2);

  for (const topic of toPublish) {
    try {
      const post = await generatePost(topic, persona, agentId, rejected);
      result.published++;
      result.posts.push({
        title: topic.title,
        wordCount: post.text.split(" ").length,
      });
    } catch (err) {
      console.error(`[Tick] Post generation error for "${topic.title}":`, err);
      result.errors++;
    }
  }

  console.log(
    `[Tick] ═══ Tick complete: ${result.published} post(s) published ═══\n`
  );

  return result;
}

/**
 * Run ticks for ALL agents in the database.
 * Used by the cron endpoint when no specific agentId is provided.
 */
export async function runTickForAllAgents(): Promise<TickResult[]> {
  const allAgents = await db.select({ id: agents.id }).from(agents);

  console.log(`[Tick] Running tick for ${allAgents.length} agent(s)`);

  const results = await Promise.allSettled(
    allAgents.map((agent) => runTick(agent.id))
  );

  return results
    .filter((r): r is PromiseFulfilledResult<TickResult> => r.status === "fulfilled")
    .map((r) => r.value);
}
