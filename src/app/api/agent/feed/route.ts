import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

/**
 * GET /api/agent/feed?agentId=<uuid>
 *
 * Returns all published posts for the given agent, newest first.
 * Returns { posts: [] } when the agent exists but has no posts yet.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId");

  if (!agentId) {
    return NextResponse.json(
      { error: "agentId query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const agentPosts = await db
      .select({
        id: posts.id,
        createdAt: posts.createdAt,
        text: posts.text,
        rationale: posts.rationale,
        sources: posts.sources,
      })
      .from(posts)
      .where(eq(posts.agentId, agentId))
      .orderBy(desc(posts.createdAt));

    return NextResponse.json({ posts: agentPosts });
  } catch (err) {
    console.error("[Feed] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch posts", detail: String(err) },
      { status: 500 }
    );
  }
}
