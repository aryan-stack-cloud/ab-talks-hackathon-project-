import { createHash } from "crypto";
import { XMLParser } from "fast-xml-parser";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Topic {
  title: string;
  url: string;
  summary: string;
  publishedAt: string; // ISO date string
  source: string; // e.g. "hackernews", "arXiv", "TechCrunch", "Dark Reading", etc.
  imageUrl: string; // News featured image URL (extracted from site or topic photo fallback)
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
    .slice(0, 32);
}

function extractText(val: unknown): string {
  if (typeof val === "string") return val;
  if (val && typeof val === "object" && "#text" in (val as object)) {
    return String((val as { "#text": unknown })["#text"]);
  }
  return String(val ?? "");
}

function cleanHtmlTags(str: string): string {
  return str.replace(/<[^>]*>?/gm, "").replace(/\s+/g, " ").trim();
}

/**
 * Realistic, high-resolution authentic tech & cybersecurity photos (no abstract wallpapers).
 */
const REAL_TECH_PHOTOS = [
  "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1200&q=80", // Hacker / Security Code Screen
  "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1200&q=80", // Binary Stream
  "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1200&q=80", // Server Room Data Center
  "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80", // Microchip & Hardware
  "https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=1200&q=80", // Cyber Security Shield
  "https://images.unsplash.com/photo-1510511459019-5dda7724fd87?auto=format&fit=crop&w=1200&q=80", // Developer Coding at Workstation
];

/**
 * Fetch the actual article page and scrape the OpenGraph og:image or twitter:image tag.
 */
export async function fetchOpenGraphImage(url: string): Promise<string | undefined> {
  if (!url || !url.startsWith("http")) return undefined;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(3500),
    });

    if (!res.ok) return undefined;

    const html = await res.text();
    const ogMatch =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["'](https?:\/\/[^"'\s]+)["']/i) ||
      html.match(/<meta[^>]+content=["'](https?:\/\/[^"'\s]+)["'][^>]+property=["']og:image["']/i) ||
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["'](https?:\/\/[^"'\s]+)["']/i);

    if (ogMatch && ogMatch[1]) {
      const imgUrl = ogMatch[1].trim();
      if (
        !imgUrl.includes("1x1") &&
        !imgUrl.includes("favicon") &&
        !imgUrl.includes("avatar") &&
        !imgUrl.includes("logo")
      ) {
        return imgUrl;
      }
    }
  } catch {
    // Non-fatal
  }
  return undefined;
}

/**
 * Returns extracted image URL or deterministically resolves a relevant tech photo fallback.
 */
export function resolveTopicImageUrl(title: string, summary: string, extractedUrl?: string): string {
  if (
    extractedUrl &&
    extractedUrl.startsWith("http") &&
    !extractedUrl.includes("1x1") &&
    !extractedUrl.includes("pixel") &&
    !extractedUrl.includes("avatar")
  ) {
    return extractedUrl;
  }

  const hash = createHash("md5").update(`${title}|${summary}`).digest("hex");
  const num = parseInt(hash.slice(0, 4), 16);
  return REAL_TECH_PHOTOS[num % REAL_TECH_PHOTOS.length];
}

/**
 * Extract featured image URL from RSS/Atom item object or HTML description.
 */
function extractImageUrl(item: Record<string, unknown>, rawSummary: string): string | undefined {
  try {
    if (item["media:content"]) {
      const mc = item["media:content"];
      if (typeof mc === "object" && mc !== null && "@_url" in mc) {
        return String((mc as { "@_url": unknown })["@_url"]);
      }
      if (Array.isArray(mc) && mc[0] && typeof mc[0] === "object" && "@_url" in mc[0]) {
        return String((mc[0] as { "@_url": unknown })["@_url"]);
      }
    }

    if (item["media:thumbnail"]) {
      const mt = item["media:thumbnail"];
      if (typeof mt === "object" && mt !== null && "@_url" in mt) {
        return String((mt as { "@_url": unknown })["@_url"]);
      }
      if (Array.isArray(mt) && mt[0] && typeof mt[0] === "object" && "@_url" in mt[0]) {
        return String((mt[0] as { "@_url": unknown })["@_url"]);
      }
    }

    if (item["enclosure"]) {
      const enc = item["enclosure"];
      if (typeof enc === "object" && enc !== null && "@_url" in enc) {
        const url = String((enc as { "@_url": unknown })["@_url"]);
        if (url.match(/\.(jpg|jpeg|png|webp|gif)/i)) {
          return url;
        }
      }
    }

    const imgMatch = rawSummary.match(/<img[^>]+src=["'](https?:\/\/[^"'\s]+)["']/i);
    if (imgMatch && imgMatch[1]) {
      return imgMatch[1];
    }
  } catch {
    // Non-fatal
  }

  return undefined;
}

// ─── 45+ Tech & Cybersecurity News Sources (RSS / Atom Feeds) ────────────────

export interface NewsFeedSource {
  name: string;
  url: string;
}

export const TECH_NEWS_SOURCES: NewsFeedSource[] = [
  // ── Premier Tech Outlets ──────────────────────────────────────────────────
  { name: "TechCrunch", url: "https://techcrunch.com/feed/" },
  { name: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
  { name: "Wired", url: "https://www.wired.com/feed/rss" },
  { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
  { name: "Reuters Technology", url: "https://news.google.com/rss/search?q=when:24h+allinurl:reuters.com+technology" },
  { name: "MIT Technology Review", url: "https://www.technologyreview.com/feed/" },
  { name: "Engadget", url: "https://www.engadget.com/rss.xml" },
  { name: "ZDNET", url: "https://www.zdnet.com/news/rss.xml" },
  { name: "CNET", url: "https://www.cnet.com/rss/news/" },
  { name: "VentureBeat", url: "https://venturebeat.com/feed/" },
  { name: "TechRadar", url: "https://www.techradar.com/rss" },
  { name: "Tom's Hardware", url: "https://www.tomshardware.com/feeds/all" },
  { name: "Android Authority", url: "https://www.androidauthority.com/feed/" },
  { name: "9to5Google", url: "https://9to5google.com/feed/" },
  { name: "9to5Mac", url: "https://9to5mac.com/feed/" },

  // ── Premier Cybersecurity Publications ────────────────────────────────────
  { name: "Dark Reading", url: "https://www.darkreading.com/rss.xml" },
  { name: "The Hacker News", url: "https://feeds.feedburner.com/TheHackersNews" },
  { name: "BleepingComputer", url: "https://www.bleepingcomputer.com/feed/" },
  { name: "SecurityWeek", url: "https://www.securityweek.com/feed/" },
  { name: "Krebs on Security", url: "https://krebsonsecurity.com/feed/" },

  // ── Deep Tech & Hardware Outlets ──────────────────────────────────────────
  { name: "IEEE Spectrum", url: "https://spectrum.ieee.org/feeds/feed.rss" },
  { name: "SiliconANGLE", url: "https://siliconangle.com/feed/" },
  { name: "Slashdot", url: "https://rss.slashdot.org/Slashdot/slashdotMain" },
  { name: "TechSpot", url: "https://www.techspot.com/backend.xml" },
  { name: "Gizmodo", url: "https://gizmodo.com/rss" },

  // ── Enterprise & Tech Business ────────────────────────────────────────────
  { name: "Computerworld", url: "https://www.computerworld.com/index.rss" },
  { name: "InfoWorld", url: "https://www.infoworld.com/index.rss" },
  { name: "Fast Company", url: "https://www.fastcompany.com/latest/rss" },

  // ── Indian & Global Regional Tech ──────────────────────────────────────────
  { name: "Gadgets 360", url: "https://www.gadgets360.com/rss/news" },
  { name: "91mobiles", url: "https://www.91mobiles.com/hub/feed/" },
  { name: "The Indian Express – Tech", url: "https://indianexpress.com/section/technology/feed/" },
  { name: "Times of India – Tech", url: "https://timesofindia.indiatimes.com/rssfeeds/66949542.cms" },
  { name: "India Today – Tech", url: "https://www.indiatoday.in/rss/1206584" },
  { name: "Analytics India Magazine", url: "https://analyticsindiamag.com/feed/" },
  { name: "Moneycontrol Tech", url: "https://www.moneycontrol.com/rss/technology.xml" },
  { name: "Livemint Tech", url: "https://www.livemint.com/rss/technology" },
  { name: "Gadgets Now", url: "https://www.gadgetsnow.com/rssfeedsection/4711948.cms" },
];

/**
 * Fetch latest stories from a given RSS/Atom feed source.
 */
export async function discoverFromRSS(source: NewsFeedSource): Promise<Topic[]> {
  try {
    const res = await fetch(source.url, {
      headers: { "User-Agent": "MiraVoss-Agent/1.0" },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return [];

    const xml = await res.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
      isArray: (name) => name === "item" || name === "entry" || name === "link",
    });

    const parsed = parser.parse(xml);
    const results: Topic[] = [];

    // Parse RSS 2.0 items
    const items = parsed?.rss?.channel?.item;
    if (items) {
      const itemArray = Array.isArray(items) ? items : [items];
      for (const item of itemArray) {
        const rawTitle = extractText(item.title);
        const rawLink = extractText(item.link || item.guid);
        const rawSummary = extractText(item.description || item["content:encoded"] || "");
        const rawDate = extractText(item.pubDate || item["dc:date"]);
        const extractedImg = extractImageUrl(item as Record<string, unknown>, rawSummary);

        const title = cleanHtmlTags(rawTitle);
        const link = rawLink.trim();
        const summary = cleanHtmlTags(rawSummary).slice(0, 400);

        if (!title || !link || !link.startsWith("http")) continue;

        const imageUrl = resolveTopicImageUrl(title, summary, extractedImg);

        results.push({
          title,
          url: link,
          summary: summary || title,
          publishedAt: rawDate ? new Date(rawDate).toISOString() : new Date().toISOString(),
          source: source.name,
          imageUrl,
          topicKey: topicKey(title, link),
        });
      }
    }

    // Parse Atom entries
    const entries = parsed?.feed?.entry;
    if (entries) {
      const entryArray = Array.isArray(entries) ? entries : [entries];
      for (const entry of entryArray) {
        const rawTitle = extractText(entry.title);
        const rawSummary = extractText(entry.summary || entry.content || "");
        const rawDate = extractText(entry.published || entry.updated);
        const extractedImg = extractImageUrl(entry as Record<string, unknown>, rawSummary);

        let link = "";
        if (Array.isArray(entry.link)) {
          const altLink = entry.link.find(
            (l: Record<string, string>) => l["@_rel"] === "alternate" || !l["@_rel"]
          );
          link = altLink ? altLink["@_href"] : entry.link[0]?.["@_href"] || "";
        } else if (entry.link && typeof entry.link === "object") {
          link = (entry.link as { "@_href": string })["@_href"] || "";
        }

        const title = cleanHtmlTags(rawTitle);
        const summary = cleanHtmlTags(rawSummary).slice(0, 400);

        if (!title || !link || !link.startsWith("http")) continue;

        const imageUrl = resolveTopicImageUrl(title, summary, extractedImg);

        results.push({
          title,
          url: link,
          summary: summary || title,
          publishedAt: rawDate ? new Date(rawDate).toISOString() : new Date().toISOString(),
          source: source.name,
          imageUrl,
          topicKey: topicKey(title, link),
        });
      }
    }

    return results.slice(0, 5);
  } catch {
    return [];
  }
}

/**
 * Fetch stories from a randomized active batch of the 40+ tech news sources.
 */
export async function discoverFromTechNews(): Promise<Topic[]> {
  const shuffled = [...TECH_NEWS_SOURCES].sort(() => Math.random() - 0.5);
  const activeBatch = shuffled.slice(0, 8);

  const feedResults = await Promise.allSettled(
    activeBatch.map((source) => discoverFromRSS(source))
  );

  const topics: Topic[] = [];
  for (const res of feedResults) {
    if (res.status === "fulfilled") {
      topics.push(...res.value);
    }
  }

  return topics;
}

// ─── Live Web Search Discovery (Google News RSS Web Index) ───────────────────

const WEB_SEARCH_QUERIES = [
  `"AI security" OR "LLM vulnerability" OR "prompt injection" when:24h`,
  `"artificial intelligence" AND (jailbreak OR backdoor OR "red team") when:24h`,
  `"model security" OR "adversarial machine learning" OR "AI exploit" when:24h`,
  `"AI threat" OR "cybersecurity AI" OR "deepfake security" when:24h`,
];

export async function discoverFromWebSearch(): Promise<Topic[]> {
  const query = WEB_SEARCH_QUERIES[Math.floor(Math.random() * WEB_SEARCH_QUERIES.length)];
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "MiraVoss-Agent/1.0" },
      signal: AbortSignal.timeout(7000),
    });

    if (!res.ok) return [];

    const xml = await res.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
      isArray: (name) => name === "item",
    });

    const parsed = parser.parse(xml);
    const items = parsed?.rss?.channel?.item;

    if (!items) return [];

    const itemArray = Array.isArray(items) ? items : [items];
    const results: Topic[] = [];

    for (const item of itemArray) {
      const rawTitle = extractText(item.title);
      const rawLink = extractText(item.link || item.guid);
      const rawSummary = extractText(item.description || "");
      const rawDate = extractText(item.pubDate);
      const rawSource = extractText(item.source);

      const title = cleanHtmlTags(rawTitle);
      const link = rawLink.trim();
      const summary = cleanHtmlTags(rawSummary).slice(0, 400);
      const sourceName = rawSource ? cleanHtmlTags(rawSource) : "Web Search";
      const extractedImg = extractImageUrl(item as Record<string, unknown>, rawSummary);

      if (!title || !link || !link.startsWith("http")) continue;

      const imageUrl = resolveTopicImageUrl(title, summary, extractedImg);

      results.push({
        title,
        url: link,
        summary: summary || title,
        publishedAt: rawDate ? new Date(rawDate).toISOString() : new Date().toISOString(),
        source: sourceName,
        imageUrl,
        topicKey: topicKey(title, link),
      });
    }

    return results.slice(0, 6);
  } catch {
    return [];
  }
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

export async function discoverFromHN(
  keywords: string[] = HN_SECURITY_KEYWORDS
): Promise<Topic[]> {
  const seen = new Set<string>();
  const results: Topic[] = [];
  const activeKeywords = keywords.slice(0, 5);

  await Promise.allSettled(
    activeKeywords.map(async (keyword) => {
      const query = encodeURIComponent(keyword);
      const url = `https://hn.algolia.com/api/v1/search_by_date?query=${query}&tags=story&hitsPerPage=8`;

      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "MiraVoss-Agent/1.0" },
          signal: AbortSignal.timeout(6000),
        });

        if (!res.ok) return;

        const data: HNResponse = await res.json();

        for (const hit of data.hits) {
          if (!hit.url || seen.has(hit.objectID)) continue;
          if (hit.points < 4) continue;

          seen.add(hit.objectID);

          const title = hit.title ?? "(no title)";
          const storyUrl = hit.url;
          const summary = hit.story_text
            ? hit.story_text.slice(0, 400)
            : `HN story with ${hit.points} points and ${hit.num_comments} comments.`;
          const imageUrl = resolveTopicImageUrl(title, summary);

          results.push({
            title,
            url: storyUrl,
            summary,
            publishedAt: hit.created_at,
            source: "Hacker News",
            imageUrl,
            topicKey: topicKey(title, storyUrl),
          });
        }
      } catch {
        // Non-fatal
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
}

interface ArxivFeed {
  feed: {
    entry?: ArxivEntry | ArxivEntry[];
  };
}

export async function discoverFromArxiv(
  category: string = "cs.CR"
): Promise<Topic[]> {
  const query = encodeURIComponent(
    `cat:${category} AND (ti:adversarial OR ti:attack OR ti:security OR ti:robust OR ti:backdoor OR ti:"prompt injection" OR ti:jailbreak OR ti:"red team")`
  );
  const url = `https://export.arxiv.org/api/query?search_query=${query}&sortBy=submittedDate&sortOrder=descending&max_results=8`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "MiraVoss-Agent/1.0" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];

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

      let paperUrl = rawId;
      if (Array.isArray(entry.link)) {
        const htmlLink = entry.link.find(
          (l: Record<string, string>) => l["@_type"] === "text/html" || l["@_href"]?.includes("abs")
        );
        if (htmlLink) paperUrl = htmlLink["@_href"];
      } else if (entry.link && typeof entry.link === "object") {
        const link = entry.link as { "@_href": string };
        paperUrl = link["@_href"] ?? rawId;
      }

      if (!paperUrl.startsWith("http")) {
        paperUrl = `https://arxiv.org/abs/${paperUrl}`;
      }

      const imageUrl = resolveTopicImageUrl(title, summary);

      results.push({
        title,
        url: paperUrl,
        summary,
        publishedAt,
        source: "arXiv",
        imageUrl,
        topicKey: topicKey(title, paperUrl),
      });
    }

    return results;
  } catch {
    return [];
  }
}

// ─── Combined Discovery ───────────────────────────────────────────────────────

/**
 * Discover topics across all channels:
 * - HN Algolia
 * - ArXiv cs.CR Research Papers
 * - 45+ Premier Tech & Cybersecurity News Outlets
 * - Live Web Search (Google News Web Index)
 */
export async function discoverTopics(): Promise<Topic[]> {
  const [hnTopics, arxivTopics, techNewsTopics, webSearchTopics] = await Promise.all([
    discoverFromHN(),
    discoverFromArxiv("cs.CR"),
    discoverFromTechNews(),
    discoverFromWebSearch(),
  ]);

  const seen = new Set<string>();
  const merged: Topic[] = [];

  for (const topic of [...hnTopics, ...arxivTopics, ...techNewsTopics, ...webSearchTopics]) {
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
    `[Discovery] Found ${merged.length} unique topics (${hnTopics.length} HN, ${arxivTopics.length} ArXiv, ${techNewsTopics.length} Tech Outlets, ${webSearchTopics.length} Web Search)`
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
  "ai",
  "llm",
  "model",
  "cybersecurity",
  "hack",
  "deepfake",
  "breach",
];

const NEGATIVE_KEYWORDS = [
  "hiring",
  "job",
  "career",
  "salary",
  "bitcoin",
  "nft",
  "series a",
  "funding round",
  "startup launch",
  "deal of the day",
  "discount code",
];

export function prefilterCandidates(
  candidates: Topic[],
  maxCandidates: number = 5
): Topic[] {
  if (candidates.length === 0) return [];

  const scored = candidates
    .map((candidate) => {
      const text = `${candidate.title} ${candidate.summary}`.toLowerCase();

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

      if (candidate.source === "arXiv") {
        score += 3;
      }

      return { candidate, score };
    })
    .filter((item) => item.score > 0);

  scored.sort((a, b) => b.score - a.score);

  const topCandidates = scored.slice(0, maxCandidates).map((item) => item.candidate);

  console.log(
    `[Prefilter] Filtered ${candidates.length} candidates down to ${topCandidates.length} top candidates for Gemini evaluation`
  );

  return topCandidates;
}
