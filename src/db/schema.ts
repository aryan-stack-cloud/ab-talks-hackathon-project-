import {
  pgTable,
  uuid,
  text,
  jsonb,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ─── agents ─────────────────────────────────────────────────────────────────
// One row per deployed AI persona instance.
export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  // Full persona config stored as JSONB so we can evolve it without migrations
  persona: jsonb("persona").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── posts ───────────────────────────────────────────────────────────────────
// Each autonomous post written and published by an agent.
export const posts = pgTable("posts", {
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
});

// ─── seen_topics ─────────────────────────────────────────────────────────────
// Memory store. Every topic the agent has evaluated (published or rejected)
// is recorded here to prevent repetition.
export const seenTopics = pgTable(
  "seen_topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    // SHA-256 hash of (title + source_url) — stable dedup key
    topicKey: text("topic_key").notNull(),
    title: text("title").notNull(),
    sourceUrl: text("source_url").notNull(),
    // true = published as a post, false = editorially rejected
    published: boolean("published").notNull().default(false),
    // The judgment reason (why published or rejected)
    rationale: text("rationale"),
    decidedAt: timestamp("decided_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Enforce uniqueness: one agent can only see a topic once
    agentTopicUnique: uniqueIndex("seen_topics_agent_topic_key").on(
      table.agentId,
      table.topicKey
    ),
  })
);

// ─── Type exports ─────────────────────────────────────────────────────────────
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type SeenTopic = typeof seenTopics.$inferSelect;
export type NewSeenTopic = typeof seenTopics.$inferInsert;
