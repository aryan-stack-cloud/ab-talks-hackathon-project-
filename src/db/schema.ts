import {
  pgTable,
  uuid,
  text,
  jsonb,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ─── agents ─────────────────────────────────────────────────────────────────
// One row per deployed AI persona instance.
export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    // Full persona config stored as JSONB so we can evolve it without migrations
    persona: jsonb("persona").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    agentCreatedAtIdx: index("agents_created_at_idx").on(table.createdAt),
  })
);

// ─── posts ───────────────────────────────────────────────────────────────────
// Each autonomous post written and published by an agent.
export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    rationale: text("rationale").notNull(),
    // Array of source URLs referenced in the post
    sources: jsonb("sources").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    postAgentIdIdx: index("posts_agent_id_idx").on(table.agentId),
    postCreatedAtIdx: index("posts_created_at_idx").on(table.createdAt),
  })
);

// ─── seen_topics ─────────────────────────────────────────────────────────────
// Long-term memory store. Every topic the agent has evaluated (published or
// rejected) is recorded here to prevent repetition and wasteful re-evaluation.
export const seenTopics = pgTable(
  "seen_topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    // SHA-256 hash of normalized (title + source_url) — stable dedup key
    topicKey: text("topic_key").notNull(),
    title: text("title").notNull(),
    sourceUrl: text("source_url").notNull(),
    // true = published as a post, false = editorially rejected
    published: boolean("published").notNull().default(false),
    // The editorial reason for the decision (publish or reject)
    decisionReason: text("decision_reason"),
    decidedAt: timestamp("decided_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Enforce uniqueness: one agent can only evaluate a topic once
    agentTopicUnique: uniqueIndex("seen_topics_agent_topic_key").on(
      table.agentId,
      table.topicKey
    ),
    seenAgentIdIdx: index("seen_topics_agent_id_idx").on(table.agentId),
    seenTopicKeyIdx: index("seen_topics_topic_key_idx").on(table.topicKey),
    seenDecidedAtIdx: index("seen_topics_decided_at_idx").on(table.decidedAt),
  })
);

// ─── Type exports ─────────────────────────────────────────────────────────────
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type SeenTopic = typeof seenTopics.$inferSelect;
export type NewSeenTopic = typeof seenTopics.$inferInsert;
