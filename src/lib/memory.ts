import { db } from "@/db";
import { seenTopics } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { Topic } from "./discovery";

/**
 * Filter out any candidates whose topic_key already exists in seen_topics
 * for this agent. This is the agent's long-term memory — it prevents
 * re-judging and re-publishing topics it has already evaluated.
 *
 * @param candidates - Topics discovered this tick
 * @param agentId    - The agent's UUID
 * @returns Subset of candidates that have never been seen before
 */
export async function filterUnseen(
  candidates: Topic[],
  agentId: string
): Promise<Topic[]> {
  if (candidates.length === 0) return [];

  const candidateKeys = candidates.map((c) => c.topicKey);

  // Single efficient query: get all matching topic_keys for this agent
  const rows = await db
    .select({ topicKey: seenTopics.topicKey })
    .from(seenTopics)
    .where(
      and(
        eq(seenTopics.agentId, agentId),
        inArray(seenTopics.topicKey, candidateKeys)
      )
    );

  const seenKeySet = new Set(rows.map((r) => r.topicKey));
  const unseen = candidates.filter((c) => !seenKeySet.has(c.topicKey));

  console.log(
    `[Memory] ${candidates.length} candidates → ${unseen.length} unseen (filtered ${candidates.length - unseen.length} already seen)`
  );

  return unseen;
}
