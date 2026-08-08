import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/**
 * Neon HTTP driver + Drizzle client singleton.
 *
 * Using the HTTP driver (neon-http) is safe for serverless/edge runtimes
 * and is recommended by Neon for Next.js deployments. Each request gets
 * a fresh connection from the Neon pool, so no connection leaks.
 */
function createDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  const sql = neon(process.env.DATABASE_URL);
  return drizzle(sql, { schema });
}

// Singleton pattern — reuse across hot-reloads in dev
const globalForDb = globalThis as unknown as { db: ReturnType<typeof createDb> | undefined };

export const db = globalForDb.db ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.db = db;
}

export type Db = typeof db;
