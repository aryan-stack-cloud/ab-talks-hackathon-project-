import { NextRequest, NextResponse } from "next/server";
import { runTick } from "@/lib/agent";

/**
 * POST /api/agent/auto-tick
 *
 * Allows the frontend UI to trigger an autonomous tick cycle
 * for an agent at user-configurable intervals (e.g. 1 min, 2 min, 5 min).
 *
 * Body: { agentId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      agentId?: string;
    };
    const agentId = body.agentId?.trim();

    if (!agentId) {
      return NextResponse.json(
        { error: "agentId parameter is required" },
        { status: 400 }
      );
    }

    const result = await runTick(agentId);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("[Auto-Tick] Error:", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
