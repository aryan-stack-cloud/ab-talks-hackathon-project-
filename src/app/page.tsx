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

const CLIENT_FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1200&q=80", // Hacker / Security Code Screen
  "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1200&q=80", // Binary Data Stream
  "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1200&q=80", // Server Room Data Center
  "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80", // Microchip & Hardware
  "https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=1200&q=80", // Cyber Security Shield
  "https://images.unsplash.com/photo-1510511459019-5dda7724fd87?auto=format&fit=crop&w=1200&q=80", // Developer Workstation
];

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
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return `${h.toString().padStart(2, "0")}:${m
      .toString()
      .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatIntervalLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes === 60) return "1 hr";
  if (minutes === 300) return "5 hr";
  if (minutes === 1440) return "1 day (24h)";
  return `${minutes} min`;
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

  // Fallback image selection based on post ID
  const hashIdx = post.id
    ? Math.abs(post.id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0))
    : 0;
  const fallbackImg = CLIENT_FALLBACK_IMAGES[hashIdx % CLIENT_FALLBACK_IMAGES.length];
  const [imgSrc, setImgSrc] = useState<string>(parsed.imageUrl || fallbackImg);

  useEffect(() => {
    setImgSrc(parsed.imageUrl || fallbackImg);
  }, [parsed.imageUrl, fallbackImg]);

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

      {/* ── Bold Impact Headline (Top) ──────────────────────────────────── */}
      {parsed.headline && <h2 className="post-headline">{parsed.headline}</h2>}

      {/* ── Featured Image (Guaranteed for 100% of posts) ──────────────── */}
      <div className="post-image-container">
        <img
          src={imgSrc}
          alt={parsed.headline || "Article Featured Image"}
          className="post-featured-image"
          onError={() => {
            if (imgSrc !== fallbackImg) {
              setImgSrc(fallbackImg);
            }
          }}
        />
      </div>

      {/* ── News Article Content (Under Image) ───────────────────────────────── */}
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
  // Live UTC Clock State
  const [utcTime, setUtcTime] = useState<string>("");

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setUtcTime(
        now.toLocaleTimeString("en-US", {
          timeZone: "UTC",
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }) + " UTC"
      );
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

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

  // Automation / Interval state (in minutes: 1, 2, 5, 10, 60, 300, 1440)
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

  // Current dateline string
  const datelineStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="app-shell">
      {/* ── Classic Printed Newspaper Front Page Masthead ────────────────── */}
      <header className="newspaper-masthead">
        {/* Gigantic Newspaper Title */}
        <h1 className="newspaper-title">DAILY NEWS</h1>

        {/* Black Inverted Category Ribbon Bar */}
        <div className="newspaper-category-ribbon">
          World - AI Security - Vulnerabilities - ArXiv Research - Hardware - Cyber
        </div>

        {/* Issue Metadata Row */}
        <div className="newspaper-issue-row">
          <span>Issue: #240104</span>
          <span className="newspaper-tagline">THE WORLD'S PREMIER AUTONOMOUS AI SECURITY NEWSPAPER</span>
          <span>Est - 2026</span>
        </div>

        {/* Grey Edition Bar */}
        <div className="newspaper-edition-bar">
          <span className="newspaper-edition-left">First Edition</span>
          <span className="newspaper-edition-right">{datelineStr} · {utcTime || "15:50:00 UTC"}</span>
        </div>
      </header>

      {/* ── Highlighted Initialize Agent Control Desk ─────────────────────── */}
      <section className="control-desk-panel">
        <div className="control-desk-header">
          <h2 className="control-desk-title">Initialize Agent Desk</h2>
          <span className="control-desk-badge">STEP 1</span>
        </div>
        <p className="init-description">
          Creates a Mira Voss agent and triggers the first autonomous discovery
          cycle immediately.
        </p>
        <div className="form-row" style={{ marginTop: "1rem" }}>
          <button
            id="btn-init-agent"
            className="btn-init-highlight"
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

      {/* ── Highlighted Post Automation & Interval Settings Desk ───────────── */}
      <section className="control-desk-panel">
        <div className="control-desk-header">
          <h2 className="control-desk-title">Post Automation & Interval Settings</h2>
          <span className="control-desk-badge">STEP 2</span>
        </div>
        <p className="init-description">
          Set the time interval to automatically discover, evaluate, and generate structured news articles.
        </p>

        <div className="form-row" style={{ marginTop: "1rem", alignItems: "center" }}>
          <div className="form-group" style={{ flex: "0 0 220px" }}>
            <label htmlFor="interval-select">Post Interval Cadence</label>
            <select
              id="interval-select"
              value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(Number(e.target.value))}
              style={{
                width: "100%",
                background: "#fff",
                border: "2px solid #000",
                color: "#000",
                fontFamily: "var(--font-mono)",
                fontSize: "0.875rem",
                fontWeight: "700",
                padding: "0.625rem 0.875rem",
                outline: "none",
              }}
            >
              <option value={1}>Every 1 minute</option>
              <option value={2}>Every 2 minutes (Default)</option>
              <option value={5}>Every 5 minutes</option>
              <option value={10}>Every 10 minutes</option>
              <option value={60}>Every 1 hour</option>
              <option value={300}>Every 5 hours</option>
              <option value={1440}>Every 1 day (24 hours)</option>
            </select>
          </div>

          <button
            id="btn-toggle-autotick"
            className="btn-toggle-autotick"
            style={{
              borderColor: "#000",
              background: autoTickEnabled ? "#000" : "#fff",
              color: autoTickEnabled ? "#00ff9d" : "#000",
              minWidth: "160px",
            }}
            onClick={() => setAutoTickEnabled(!autoTickEnabled)}
            disabled={!activeAgentId}
          >
            {autoTickEnabled ? "Auto-Post: ON 🟢" : "Auto-Post: OFF 🔴"}
          </button>

          <button
            id="btn-trigger-now"
            className="btn-trigger-highlight"
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
                ? `🟢 Auto-Post Active (Every ${formatIntervalLabel(
                    intervalMinutes
                  )}) — Next run in ${formatCountdown(countdownSeconds)}`
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
