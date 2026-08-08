import { NextRequest, NextResponse } from "next/server";
import { runTick, runTickForAllAgents } from "@/lib/agent";

/**
 * Validates request authorization header against CRON_SECRET.
 * Supports:
 * - Authorization: Bearer <CRON_SECRET>
 * - x-cron-secret: <CRON_SECRET>
 */
function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return true; // If CRON_SECRET is not configured in env, allow execution
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  const cronHeader = request.headers.get("x-cron-secret")?.trim();

  return token === cronSecret || cronHeader === cronSecret;
}

/**
 * POST /api/agent/tick
 *
 * Manual or automated tick trigger via POST.
 * Auth: Authorization: Bearer <CRON_SECRET> or x-cron-secret: <CRON_SECRET>
 * Body (optional): { agentId?: string }
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let agentId: string | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      agentId?: string;
    };
    agentId = body.agentId?.trim();
  } catch {
    agentId = undefined;
  }

  try {
    if (agentId) {
      const result = await runTick(agentId);
      return NextResponse.json({ ok: true, results: [result] });
    } else {
      const results = await runTickForAllAgents();
      return NextResponse.json({ ok: true, results });
    }
  } catch (err) {
    console.error("[Tick POST] Unhandled error:", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/agent/tick
 *
 * Vercel Cron invocation route (Vercel Cron calls configured paths with HTTP GET).
 * Auth: Authorization: Bearer <CRON_SECRET> or x-cron-secret: <CRON_SECRET>
 * Query parameter (optional): ?agentId=<uuid>
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId")?.trim();

  try {
    if (agentId) {
      const result = await runTick(agentId);
      return NextResponse.json({ ok: true, results: [result] });
    } else {
      const results = await runTickForAllAgents();
      return NextResponse.json({ ok: true, results });
    }
  } catch (err) {
    console.error("[Tick GET] Unhandled error:", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
