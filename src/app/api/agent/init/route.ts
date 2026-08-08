import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { CIPHER_PERSONA } from "@/lib/persona";
import { runTick } from "@/lib/agent";

/**
 * POST /api/agent/init
 *
 * Creates a new CIPHER agent row, then fires one tick immediately
 * (fire-and-forget via void to avoid Vercel 10s serverless timeout).
 *
 * Body: { name: string, domain: string }
 * Returns: { agentId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { name?: string; domain?: string };

    const name = body.name?.trim() || "CIPHER";
    const domain = body.domain?.trim() || "ai-security";

    if (!name || !domain) {
      return NextResponse.json(
        { error: "name and domain are required" },
        { status: 400 }
      );
    }

    // Insert agent row with CIPHER persona
    const [newAgent] = await db
      .insert(agents)
      .values({
        name,
        domain,
        persona: CIPHER_PERSONA,
        createdAt: new Date(),
      })
      .returning({ id: agents.id });

    const agentId = newAgent.id;
    console.log(`[Init] Created agent ${agentId} (${name} / ${domain})`);

    // Fire initial tick as fire-and-forget — don't await to avoid timeout
    // The tick runs in the background and populates the first posts
    void runTick(agentId).catch((err) => {
      console.error(`[Init] Background tick failed for ${agentId}:`, err);
    });

    return NextResponse.json({ agentId }, { status: 201 });
  } catch (err) {
    console.error("[Init] Error:", err);
    return NextResponse.json(
      { error: "Failed to create agent", detail: String(err) },
      { status: 500 }
    );
  }
}
