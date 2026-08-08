import { db } from "@/db";
import { seenTopics } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
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

  // Fetch all topic_keys already seen by this agent from the candidate set
  const existing = await db
    .select({ topicKey: seenTopics.topicKey })
    .from(seenTopics)
    .where(
      eq(seenTopics.agentId, agentId)
    )
    .then((rows) => {
      // Post-filter in JS since inArray on large sets can be expensive
      // and we already have all keys in memory
      const existingKeys = new Set(rows.map((r) => r.topicKey));
      return existingKeys;
    });

  // Also use inArray for precision when candidate set is small
  let seenKeySet: Set<string>;

  if (candidateKeys.length <= 50) {
    const rows = await db
      .select({ topicKey: seenTopics.topicKey })
      .from(seenTopics)
      .where(
        inArray(seenTopics.topicKey, candidateKeys)
      );
    seenKeySet = new Set(rows.map((r) => r.topicKey));
  } else {
    seenKeySet = existing;
  }

  const unseen = candidates.filter((c) => !seenKeySet.has(c.topicKey));

  console.log(
    `[Memory] ${candidates.length} candidates → ${unseen.length} unseen (filtered ${candidates.length - unseen.length} already seen)`
  );

  return unseen;
}
