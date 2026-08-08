import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { MIRA_VOSS_PERSONA } from "@/lib/persona";
import { runTick } from "@/lib/agent";

/**
 * POST /api/agent/init
 *
 * Creates a Mira Voss agent row with the full persona configuration,
 * then fires an initial tick as fire-and-forget (void) to avoid making
 * the initialization request wait for the full discovery/LLM pipeline.
 *
 * Accepts two body shapes for evaluator compatibility:
 *   Shape A (spec):  { "persona": { "name": "Mira Voss", "domain": "AI Security" } }
 *   Shape B (simple): { "name": "Mira Voss", "domain": "AI Security" }
 *
 * Returns: { "agentId": "<uuid>" }
 */
export async function POST(request: NextRequest) {
  try {
    // Support both body shapes
    const body = (await request.json()) as {
      persona?: { name?: string; domain?: string };
      name?: string;
      domain?: string;
    };

    const name =
      body.persona?.name?.trim() || body.name?.trim() || MIRA_VOSS_PERSONA.name;
    const domain =
      body.persona?.domain?.trim() ||
      body.domain?.trim() ||
      MIRA_VOSS_PERSONA.domain;

    if (!name || !domain) {
      return NextResponse.json(
        { error: "name and domain are required" },
        { status: 400 }
      );
    }

    // Build the persona — always use the canonical Mira Voss config
    // but allow the name/domain fields to be overridden by the caller.
    const personaConfig = {
      ...MIRA_VOSS_PERSONA,
      name,
      domain,
    };

    // Insert agent row
    const [newAgent] = await db
      .insert(agents)
      .values({
        name,
        domain,
        persona: personaConfig,
        createdAt: new Date(),
      })
      .returning({ id: agents.id });

    const agentId = newAgent.id;
    console.log(
      `[Init] Created agent ${agentId} — name: "${name}", domain: "${domain}"`
    );

    // Fire initial tick as fire-and-forget.
    // The tick runs in the background; the response returns immediately.
    // This avoids Vercel serverless function 10s timeout on slow LLM calls.
    void runTick(agentId).catch((err) => {
      console.error(`[Init] Initial tick failed for agent ${agentId}:`, err);
    });

    return NextResponse.json({ agentId }, { status: 201 });
  } catch (err) {
    console.error("[Init] Error creating agent:", err);
    return NextResponse.json(
      { error: "Failed to create agent", detail: String(err) },
      { status: 500 }
    );
  }
}
