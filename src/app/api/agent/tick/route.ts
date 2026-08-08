import { NextRequest, NextResponse } from "next/server";
import { runTick, runTickForAllAgents } from "@/lib/agent";

/**
 * POST /api/agent/tick
 *
 * Secured endpoint that runs one agent cycle:
 * discover → filter → judge → generate+publish
 *
 * Authentication: Bearer token in Authorization header (CRON_SECRET).
 * Vercel Cron sends this automatically if configured in vercel.json.
 *
 * Body (optional): { agentId: string }
 * - If agentId is provided: runs tick for that agent only
 * - If omitted: runs tick for ALL agents (cron use case)
 *
 * Returns: { ok: true, results: TickResult[] }
 */
export async function POST(request: NextRequest) {
  // ── Auth check ────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();

    // Also check x-cron-secret header (Vercel Cron style)
    const cronHeader = request.headers.get("x-cron-secret");

    if (token !== cronSecret && cronHeader !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let agentId: string | undefined;

  try {
    const body = await request.json().catch(() => ({})) as { agentId?: string };
    agentId = body.agentId?.trim();
  } catch {
    agentId = undefined;
  }

  // ── Run tick(s) ───────────────────────────────────────────────────────────
  try {
    if (agentId) {
      const result = await runTick(agentId);
      return NextResponse.json({ ok: true, results: [result] });
    } else {
      const results = await runTickForAllAgents();
      return NextResponse.json({ ok: true, results });
    }
  } catch (err) {
    console.error("[Tick Route] Unhandled error:", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}

// Allow Vercel Cron to call this with GET as well (vercel.json cron uses GET by default)
export async function GET(request: NextRequest) {
  // For Vercel Cron GET requests — check the authorization header
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();

    if (token !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const results = await runTickForAllAgents();
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    console.error("[Tick Cron] Unhandled error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
