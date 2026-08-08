import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

// Load .env.local for drizzle-kit CLI commands (db:push, db:generate, etc.)
// Next.js loads this automatically at runtime, but drizzle-kit does not.
dotenv.config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: false, // Allow push without interactive confirmation in CI
});
