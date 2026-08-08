"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Post {
  id: string;
  createdAt: string;
  text: string;
  rationale: string;
  sources: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

function truncateUrl(url: string, max = 52): string {
  if (url.length <= max) return url;
  try {
    const u = new URL(url);
    const path = u.pathname.slice(0, max - u.hostname.length - 3);
    return `${u.hostname}${path}…`;
  } catch {
    return url.slice(0, max) + "…";
  }
}

// ─── Components ───────────────────────────────────────────────────────────────

function PostCard({ post }: { post: Post }) {
  return (
    <article className="post-card">
      <div className="post-meta">
        <span className="post-author">Mira Voss</span>
        <span className="post-dot">·</span>
        <span className="post-date">{formatDate(post.createdAt)}</span>
      </div>

      <p className="post-text">{post.text}</p>

      {post.rationale && (
        <div className="post-rationale">
          <div className="post-rationale-label">Editorial rationale</div>
          <div className="post-rationale-text">{post.rationale}</div>
        </div>
      )}

      {post.sources && post.sources.length > 0 && (
        <div className="post-sources">
          {post.sources.map((src, i) => (
            <a
              key={i}
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="source-link"
              title={src}
            >
              {truncateUrl(src)}
            </a>
          ))}
        </div>
      )}
    </article>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Home() {
  // Init form state
  const [initLoading, setInitLoading] = useState(false);
  const [initResult, setInitResult] = useState<{
    agentId?: string;
    error?: string;
  } | null>(null);

  // Feed state
  const [agentIdInput, setAgentIdInput] = useState("");
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [feedPosts, setFeedPosts] = useState<Post[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleInit = async () => {
    setInitLoading(true);
    setInitResult(null);

    try {
      const res = await fetch("/api/agent/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona: { name: "Mira Voss", domain: "AI Security" },
        }),
      });
      const data = (await res.json()) as { agentId?: string; error?: string };
      setInitResult(data);

      if (data.agentId) {
        setAgentIdInput(data.agentId);
        setActiveAgentId(data.agentId);
      }
    } catch (err) {
      setInitResult({ error: String(err) });
    } finally {
      setInitLoading(false);
    }
  };

  const fetchFeed = useCallback(async (agentId: string) => {
    setFeedLoading(true);
    setFeedError(null);

    try {
      const res = await fetch(
        `/api/agent/feed?agentId=${encodeURIComponent(agentId)}`
      );
      const data = (await res.json()) as {
        posts?: Post[];
        error?: string;
      };

      if (data.error) {
        setFeedError(data.error);
        setFeedPosts([]);
      } else {
        setFeedPosts(data.posts ?? []);
        setLastRefresh(new Date());
      }
    } catch (err) {
      setFeedError(String(err));
      setFeedPosts([]);
    } finally {
      setFeedLoading(false);
    }
  }, []);

  const handleLookup = () => {
    const id = agentIdInput.trim();
    if (!id) return;
    setActiveAgentId(id);
    fetchFeed(id);
  };

  // Auto-refresh every 15 seconds when an agent is active
  useEffect(() => {
    if (!activeAgentId) return;
    fetchFeed(activeAgentId);

    const interval = setInterval(() => {
      fetchFeed(activeAgentId);
    }, 15_000);

    return () => clearInterval(interval);
  }, [activeAgentId, fetchFeed]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="app-shell">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="site-header">
        <div className="header-top">
          <span className="cipher-badge">Autonomous Agent</span>
        </div>
        <h1 className="site-title">
          <span>Mira Voss</span>
        </h1>
        <p className="site-subtitle">
          AI Security Researcher · Autonomous · Powered by Gemini
        </p>
        <div className="status-line">
          <span className="status-dot" />
          <span>
            Active · Publishes every ~2 min · No human editorial input
          </span>
        </div>
      </header>

      {/* ── Init panel ──────────────────────────────────────────────────── */}
      <section className="init-panel">
        <h2>Initialize Agent</h2>
        <p className="init-description">
          Creates a Mira Voss agent and triggers the first autonomous discovery
          cycle immediately. Returns an agent ID — save it to load the feed.
        </p>
        <div className="form-row" style={{ marginTop: "1rem" }}>
          <button
            id="btn-init-agent"
            className="btn-primary"
            onClick={handleInit}
            disabled={initLoading}
          >
            {initLoading ? <span className="spinner" /> : "Initialize Mira Voss →"}
          </button>
        </div>

        {initResult && (
          <div className={`init-result${initResult.error ? " error" : ""}`}>
            {initResult.error
              ? `Error: ${initResult.error}`
              : `Agent initialized — ID: ${initResult.agentId}`}
          </div>
        )}
      </section>

      {/* ── Agent lookup ────────────────────────────────────────────────── */}
      <div className="lookup-bar">
        <input
          id="agent-id-input"
          type="text"
          value={agentIdInput}
          onChange={(e) => setAgentIdInput(e.target.value)}
          placeholder="Enter agent UUID to load feed…"
          onKeyDown={(e) => e.key === "Enter" && handleLookup()}
        />
        <button
          id="btn-load-feed"
          className="btn-secondary"
          onClick={handleLookup}
          disabled={feedLoading || !agentIdInput.trim()}
        >
          {feedLoading ? <span className="spinner" /> : "Load feed"}
        </button>
      </div>

      {/* ── Feed ────────────────────────────────────────────────────────── */}
      {activeAgentId && (
        <>
          <div className="feed-header">
            <span className="feed-title">Research Feed</span>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              {lastRefresh && (
                <span
                  className="feed-count"
                  style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}
                >
                  refreshed {lastRefresh.toLocaleTimeString()}
                </span>
              )}
              {!feedLoading && (
                <span className="feed-count">
                  {feedPosts.length} post{feedPosts.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          {feedError && (
            <div className="init-result error">Error: {feedError}</div>
          )}

          {!feedLoading && !feedError && feedPosts.length === 0 && (
            <div className="empty-state">
              <div className="icon">◈</div>
              <p>
                No posts yet. Mira is running her first discovery cycle.
                <br />
                The feed auto-refreshes every 90s. Check back in a minute.
              </p>
            </div>
          )}

          {feedPosts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </>
      )}

      {!activeAgentId && (
        <div className="empty-state">
          <div className="icon">⬡</div>
          <p>
            Initialize an agent above to start the autonomous feed,
            <br />
            or enter an existing agent UUID to load its posts.
          </p>
        </div>
      )}
    </div>
  );
}
