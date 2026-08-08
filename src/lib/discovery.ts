import { createHash } from "crypto";
import { XMLParser } from "fast-xml-parser";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Topic {
  title: string;
  url: string;
  summary: string;
  publishedAt: string; // ISO date string
  source: "hackernews" | "arxiv";
  topicKey: string; // SHA-256 hash of title+url for dedup
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Stable dedup key: SHA-256 of lowercased (title + url).
 * Must match the key used in filterUnseen and judgment.
 */
export function topicKey(title: string, url: string): string {
  return createHash("sha256")
    .update(`${title.toLowerCase().trim()}|${url.toLowerCase().trim()}`)
    .digest("hex")
    .slice(0, 32); // 32 hex chars is plenty for uniqueness
}

// ─── HN Algolia ──────────────────────────────────────────────────────────────

const HN_SECURITY_KEYWORDS = [
  "AI security",
  "LLM attack",
  "prompt injection",
  "jailbreak",
  "model extraction",
  "adversarial",
  "AI red team",
  "AI safety",
  "supply chain AI",
  "model weights",
  "AI vulnerability",
  "LLM exploit",
  "AI backdoor",
  "AI alignment",
  "AI risk",
];

interface HNHit {
  objectID: string;
  title: string;
  url?: string;
  story_text?: string;
  created_at: string;
  points: number;
  num_comments: number;
}

interface HNResponse {
  hits: HNHit[];
}

/**
 * Fetch AI-security relevant stories from Hacker News via Algolia.
 * We query each keyword separately and deduplicate by objectID.
 */
export async function discoverFromHN(
  keywords: string[] = HN_SECURITY_KEYWORDS
): Promise<Topic[]> {
  const seen = new Set<string>();
  const results: Topic[] = [];

  // Only query the first 6 keywords to stay within reasonable latency
  const activeKeywords = keywords.slice(0, 6);

  await Promise.allSettled(
    activeKeywords.map(async (keyword) => {
      const query = encodeURIComponent(keyword);
      const url = `https://hn.algolia.com/api/v1/search_by_date?query=${query}&tags=story&hitsPerPage=10`;

      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "MiraVoss-Agent/1.0" },
          signal: AbortSignal.timeout(8000),
        });

        if (!res.ok) return;

        const data: HNResponse = await res.json();

        for (const hit of data.hits) {
          // Must have a URL to be useful
          if (!hit.url || seen.has(hit.objectID)) continue;
          // Filter out very low-engagement stories (< 5 points)
          if (hit.points < 5) continue;

          seen.add(hit.objectID);

          const title = hit.title ?? "(no title)";
          const storyUrl = hit.url;

          results.push({
            title,
            url: storyUrl,
            summary:
              hit.story_text
                ? hit.story_text.slice(0, 400)
                : `HN story with ${hit.points} points and ${hit.num_comments} comments.`,
            publishedAt: hit.created_at,
            source: "hackernews",
            topicKey: topicKey(title, storyUrl),
          });
        }
      } catch {
        // Non-fatal: log and continue
        console.warn(`[Discovery] HN fetch failed for keyword "${keyword}"`);
      }
    })
  );

  return results;
}

// ─── ArXiv ───────────────────────────────────────────────────────────────────

interface ArxivEntry {
  id: string | { "#text": string };
  title: string | { "#text": string };
  summary: string | { "#text": string };
  published: string | { "#text": string };
  link?: Array<{ "@_href": string; "@_type"?: string }> | { "@_href": string };
  author?: unknown;
}

interface ArxivFeed {
  feed: {
    entry?: ArxivEntry | ArxivEntry[];
  };
}

function extractText(val: unknown): string {
  if (typeof val === "string") return val;
  if (val && typeof val === "object" && "#text" in (val as object)) {
    return String((val as { "#text": unknown })["#text"]);
  }
  return String(val ?? "");
}

/**
 * Fetch latest papers from ArXiv for AI security research.
 * Default categories: cs.CR (Cryptography & Security) with AI keyword filter.
 */
export async function discoverFromArxiv(
  category: string = "cs.CR"
): Promise<Topic[]> {
  const query = encodeURIComponent(
    `cat:${category} AND (ti:adversarial OR ti:attack OR ti:security OR ti:robust OR ti:backdoor OR ti:"prompt injection" OR ti:jailbreak OR ti:"red team")`
  );
  const url = `https://export.arxiv.org/api/query?search_query=${query}&sortBy=submittedDate&sortOrder=descending&max_results=10`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "MiraVoss-Agent/1.0" },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[Discovery] ArXiv returned ${res.status}`);
      return [];
    }

    const xml = await res.text();

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
      isArray: (name) => name === "entry" || name === "link",
    });

    const parsed: ArxivFeed = parser.parse(xml);
    const entries = parsed?.feed?.entry;

    if (!entries) return [];

    const entryArray = Array.isArray(entries) ? entries : [entries];
    const results: Topic[] = [];

    for (const entry of entryArray) {
      const rawId = extractText(entry.id);
      const title = extractText(entry.title).replace(/\s+/g, " ").trim();
      const summary = extractText(entry.summary)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 500);
      const publishedAt = extractText(entry.published);

      // Extract the HTML abstract link
      let paperUrl = rawId;
      if (Array.isArray(entry.link)) {
        const htmlLink = entry.link.find(
          (l) => l["@_type"] === "text/html" || l["@_href"]?.includes("abs")
        );
        if (htmlLink) paperUrl = htmlLink["@_href"];
      } else if (entry.link && typeof entry.link === "object") {
        const link = entry.link as { "@_href": string };
        paperUrl = link["@_href"] ?? rawId;
      }

      // Convert arxiv.org/abs/ ID to full URL if needed
      if (!paperUrl.startsWith("http")) {
        paperUrl = `https://arxiv.org/abs/${paperUrl}`;
      }

      results.push({
        title,
        url: paperUrl,
        summary,
        publishedAt,
        source: "arxiv",
        topicKey: topicKey(title, paperUrl),
      });
    }

    return results;
  } catch (err) {
    console.warn("[Discovery] ArXiv fetch failed:", err);
    return [];
  }
}

// ─── Combined discovery ───────────────────────────────────────────────────────

/**
 * Discover topics from all sources, deduplicate by topicKey.
 * Returns merged list ordered newest-first.
 */
export async function discoverTopics(): Promise<Topic[]> {
  const [hnTopics, arxivTopics] = await Promise.all([
    discoverFromHN(),
    discoverFromArxiv("cs.CR"),
  ]);

  const seen = new Set<string>();
  const merged: Topic[] = [];

  for (const topic of [...hnTopics, ...arxivTopics]) {
    if (seen.has(topic.topicKey)) continue;
    seen.add(topic.topicKey);
    merged.push(topic);
  }

  // Sort newest-first
  merged.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  console.log(
    `[Discovery] Found ${merged.length} unique topics (${hnTopics.length} HN, ${arxivTopics.length} ArXiv)`
  );

  return merged;
}

// ─── Local Pre-filter ─────────────────────────────────────────────────────────

const POSITIVE_SECURITY_KEYWORDS = [
  "security",
  "attack",
  "vulnerability",
  "exploit",
  "prompt injection",
  "jailbreak",
  "adversarial",
  "backdoor",
  "red team",
  "model extraction",
  "poisoning",
  "robustness",
  "privacy",
  "leakage",
  "malware",
  "trojan",
  "defense",
  "threat",
  "sandbox",
  "bypass",
  "exfiltration",
  "unauthorized",
  "alignment",
  "risk",
  "safety",
  "trust",
  "supply chain",
  "weights",
];

const NEGATIVE_KEYWORDS = [
  "hiring",
  "job",
  "career",
  "salary",
  "marketing",
  "bitcoin",
  "nft",
  "series a",
  "funding round",
  "startup launch",
  "best ai tools",
  "productivity",
  "art generation",
];

/**
 * Local pre-filter to remove obvious non-AI-security stories and select
 * the strongest 3-5 candidates locally using keyword and heuristic rules.
 * This drastically reduces Gemini API request volume.
 */
export function prefilterCandidates(
  candidates: Topic[],
  maxCandidates: number = 5
): Topic[] {
  if (candidates.length === 0) return [];

  const scored = candidates
    .map((candidate) => {
      const text = `${candidate.title} ${candidate.summary}`.toLowerCase();

      // Check negative keywords first
      for (const neg of NEGATIVE_KEYWORDS) {
        if (text.includes(neg)) {
          return { candidate, score: -10 };
        }
      }

      let score = 0;
      for (const pos of POSITIVE_SECURITY_KEYWORDS) {
        if (text.includes(pos)) {
          score += 2;
        }
      }

      // ArXiv cs.CR papers default to higher baseline relevance
      if (candidate.source === "arxiv") {
        score += 3;
      }

      return { candidate, score };
    })
    .filter((item) => item.score > 0);

  // Sort by local relevance score descending
  scored.sort((a, b) => b.score - a.score);

  const topCandidates = scored.slice(0, maxCandidates).map((item) => item.candidate);

  console.log(
    `[Prefilter] Filtered ${candidates.length} candidates down to ${topCandidates.length} top candidates for Gemini evaluation`
  );

  return topCandidates;
}

