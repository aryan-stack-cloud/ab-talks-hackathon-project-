"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Post {
  id: string;
  createdAt: string;
  text: string;
  rationale: string;
  sources: string[];
}

interface ParsedPost {
  headline?: string;
  takeaway?: string;
  keyPoints?: string[];
  body?: string;
  sourceName?: string;
  imageUrl?: string;
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

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function parsePostContent(raw: string): {
  headline?: string;
  takeaway?: string;
  keyPoints?: string[];
  paragraphs: string[];
  sourceName?: string;
  imageUrl?: string;
} {
  try {
    const parsed = JSON.parse(raw) as ParsedPost;
    if (parsed.headline || parsed.body) {
      const paragraphs = (parsed.body || "")
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      return {
        headline: parsed.headline,
        takeaway: parsed.takeaway,
        keyPoints: parsed.keyPoints,
        paragraphs: paragraphs.length > 0 ? paragraphs : [parsed.body || ""],
        sourceName: parsed.sourceName,
        imageUrl: parsed.imageUrl,
      };
    }
  } catch {
    // Fall back to clean paragraph splitting for older plain-text posts
  }

  const paragraphs = raw
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return {
    paragraphs: paragraphs.length > 0 ? paragraphs : [raw],
  };
}

// ─── Components ───────────────────────────────────────────────────────────────

function PostCard({ post }: { post: Post }) {
  const [copied, setCopied] = useState(false);
  const parsed = parsePostContent(post.text);
  const primarySource = post.sources && post.sources[0] ? post.sources[0] : null;

  const handleCopyLink = () => {
    if (primarySource) {
      navigator.clipboard.writeText(primarySource);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <article className="post-card">
      {/* ── Card Meta Header ────────────────────────────────────────────── */}
      <div className="post-meta">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span className="post-author">Mira Voss</span>
          {parsed.sourceName && (
            <span className="source-badge">{parsed.sourceName}</span>
          )}
        </div>
        <span className="post-date">{formatDate(post.createdAt)}</span>
      </div>

      {/* ── Bold News Headline (Top) ────────────────────────────────────── */}
      {parsed.headline && <h2 className="post-headline">{parsed.headline}</h2>}

      {/* ── Featured Image (Directly Below Headline) ────────────────────── */}
      {parsed.imageUrl && (
        <div className="post-image-container">
          <img
            src={parsed.imageUrl}
            alt={parsed.headline || "Article Featured Image"}
            className="post-featured-image"
            onError={(e) => {
              // Hide image container on broken image link
              (e.currentTarget.parentElement as HTMLElement).style.display = "none";
            }}
          />
        </div>
      )}

      {/* ── Article Content (Under Image) ───────────────────────────────── */}
      {parsed.takeaway && (
        <div className="post-takeaway-box">
          <div className="post-takeaway-label">Executive Threat Takeaway</div>
          <p className="post-takeaway-text">{parsed.takeaway}</p>
        </div>
      )}

      {parsed.keyPoints && parsed.keyPoints.length > 0 && (
        <ul className="post-keypoints">
          {parsed.keyPoints.map((point, i) => (
            <li key={i}>
              <span className="bullet-icon">◈</span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="post-body">
        {parsed.paragraphs.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      {/* ── Editorial Rationale ────────────────────────────────────────── */}
      {post.rationale && (
        <div className="post-rationale">
          <div className="post-rationale-label">Mira Voss Editorial Analysis</div>
          <div className="post-rationale-text">{post.rationale}</div>
        </div>
      )}

      {/* ── Action Footer Bar ──────────────────────────────────────────── */}
      <div className="post-footer">
        {primarySource ? (
          <a
            href={primarySource}
            target="_blank"
            rel="noopener noreferrer"
            className="source-link-btn"
          >
            Read Source Article ↗
          </a>
        ) : (
          <div />
        )}

        {primarySource && (
          <button
            className="copy-btn"
            onClick={handleCopyLink}
            title="Copy article link"
          >
            {copied ? "Copied! 📋" : "Share Link 🔗"}
          </button>
        )}
      </div>
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

  // Automation / Interval state
  const [intervalMinutes, setIntervalMinutes] = useState<number>(2);
  const [autoTickEnabled, setAutoTickEnabled] = useState<boolean>(true);
  const [tickLoading, setTickLoading] = useState<boolean>(false);
  const [tickStatus, setTickStatus] = useState<string | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(120);

  const activeAgentIdRef = useRef<string | null>(null);
  activeAgentIdRef.current = activeAgentId;

  // ── Feed Fetcher ────────────────────────────────────────────────────────────

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

  // ── Auto Tick Handler ──────────────────────────────────────────────────────

  const runAutoTick = useCallback(
    async (agentId: string) => {
      setTickLoading(true);
      setTickStatus("Running autonomous discovery & post generation cycle...");

      try {
        const res = await fetch("/api/agent/auto-tick", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId }),
        });

        const data = (await res.json()) as {
          ok?: boolean;
          result?: { published: number; judged: number };
          error?: string;
        };

        if (data.ok && data.result) {
          const count = data.result.published;
          setTickStatus(
            count > 0
              ? `Published ${count} new article!`
              : `Tick complete (${data.result.judged} evaluated — no new publishable topic)`
          );
        } else if (data.error) {
          setTickStatus(`Tick note: ${data.error}`);
        }

        await fetchFeed(agentId);
      } catch (err) {
        console.error("Auto tick error:", err);
        setTickStatus("Tick cycle complete");
      } finally {
        setTickLoading(false);
      }
    },
    [fetchFeed]
  );

  // ── Init & Lookup Handlers ─────────────────────────────────────────────────

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
        fetchFeed(data.agentId);
      }
    } catch (err) {
      setInitResult({ error: String(err) });
    } finally {
      setInitLoading(false);
    }
  };

  const handleLookup = () => {
    const id = agentIdInput.trim();
    if (!id) return;
    setActiveAgentId(id);
    fetchFeed(id);
  };

  const handleManualTickNow = () => {
    if (!activeAgentId) return;
    runAutoTick(activeAgentId);
    setCountdownSeconds(intervalMinutes * 60);
  };

  // Reset countdown when interval changes
  useEffect(() => {
    setCountdownSeconds(intervalMinutes * 60);
  }, [intervalMinutes]);

  // Timer loop: decrement countdown, trigger tick when countdown reaches 0
  useEffect(() => {
    if (!autoTickEnabled || !activeAgentId) return;

    const timer = setInterval(() => {
      setCountdownSeconds((prev) => {
        if (prev <= 1) {
          const currentId = activeAgentIdRef.current;
          if (currentId) {
            runAutoTick(currentId);
          }
          return intervalMinutes * 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [autoTickEnabled, activeAgentId, intervalMinutes, runAutoTick]);

  // Feed auto-refresh background interval (every 10s)
  useEffect(() => {
    if (!activeAgentId) return;

    const interval = setInterval(() => {
      fetchFeed(activeAgentId);
    }, 10_000);

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
          AI Security Researcher · Autonomous News Outlet · Powered by Gemini
        </p>
        <div className="status-line">
          <span className="status-dot" />
          <span>
            Active · Configured: Every ~{intervalMinutes} min · No human input required
          </span>
        </div>
      </header>

      {/* ── Init panel ──────────────────────────────────────────────────── */}
      <section className="init-panel">
        <h2>Initialize Agent</h2>
        <p className="init-description">
          Creates a Mira Voss agent and triggers the first autonomous discovery
          cycle immediately.
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

      {/* ── Automation Interval Settings ─────────────────────────────────── */}
      <section className="init-panel">
        <h2>Post Automation & Interval Settings</h2>
        <p className="init-description">
          Set the time interval to automatically discover, evaluate, and generate structured news articles.
        </p>

        <div className="form-row" style={{ marginTop: "1rem", alignItems: "center" }}>
          <div className="form-group" style={{ flex: "0 0 200px" }}>
            <label htmlFor="interval-select">Post Interval</label>
            <select
              id="interval-select"
              value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(Number(e.target.value))}
              style={{
                width: "100%",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
                fontSize: "0.875rem",
                padding: "0.625rem 0.875rem",
                outline: "none",
              }}
            >
              <option value={1}>Every 1 minute</option>
              <option value={2}>Every 2 minutes (Default)</option>
              <option value={5}>Every 5 minutes</option>
              <option value={10}>Every 10 minutes</option>
            </select>
          </div>

          <button
            id="btn-toggle-autotick"
            className="btn-secondary"
            style={{
              borderColor: autoTickEnabled ? "var(--green)" : "var(--border)",
              color: autoTickEnabled ? "var(--green)" : "var(--text-muted)",
              minWidth: "160px",
            }}
            onClick={() => setAutoTickEnabled(!autoTickEnabled)}
            disabled={!activeAgentId}
          >
            {autoTickEnabled ? "Auto-Post: ON 🟢" : "Auto-Post: OFF 🔴"}
          </button>

          <button
            id="btn-trigger-now"
            className="btn-primary"
            onClick={handleManualTickNow}
            disabled={tickLoading || !activeAgentId}
          >
            {tickLoading ? <span className="spinner" /> : "Trigger New Post Now ⚡"}
          </button>
        </div>

        {activeAgentId && (
          <div
            className="init-result"
            style={{
              marginTop: "1rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>
              {autoTickEnabled
                ? `🟢 Auto-Post Active (Every ${intervalMinutes}m) — Next run in ${formatCountdown(
                    countdownSeconds
                  )}`
                : "🔴 Auto-Post Paused — click button to resume or trigger manually"}
            </span>
            {tickStatus && (
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                {tickStatus}
              </span>
            )}
          </div>
        )}
      </section>

      {/* ── Agent lookup ────────────────────────────────────────────────── */}
      <div className="lookup-bar" style={{ marginTop: "1.5rem" }}>
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
                  {feedPosts.length} article{feedPosts.length !== 1 ? "s" : ""}
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
                No articles published yet. Mira is running her first discovery cycle.
                <br />
                The feed auto-refreshes continuously. Check back in a moment.
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
            or enter an existing agent UUID to load its research feed.
          </p>
        </div>
      )}
    </div>
  );
}
