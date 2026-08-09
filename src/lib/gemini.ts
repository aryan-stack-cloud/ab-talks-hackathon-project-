/**
 * Gemini client singleton using @google/genai (unified SDK).
 *
 * All Gemini API calls go through this module. The API key is read
 * server-side from GEMINI_API_KEY and never exposed to the browser.
 *
 * Model is configurable via GEMINI_MODEL env var, defaulting to
 * gemini-3.5-flash-lite.
 */
import { GoogleGenAI, Type } from "@google/genai";

// ─── Configuration ────────────────────────────────────────────────────────────

export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";

// ─── Singleton ────────────────────────────────────────────────────────────────

let _genai: GoogleGenAI | null = null;

export function getGenAI(): GoogleGenAI {
  if (!_genai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY environment variable is not set. " +
          "Add it to .env.local — never commit it."
      );
    }
    _genai = new GoogleGenAI({ apiKey });
  }
  return _genai;
}

// ─── JSON Schema definitions ──────────────────────────────────────────────────

/**
 * Schema for batch editorial judgment output.
 * { decisions: [{ candidateIndex: number, decision: "publish" | "reject", score: number, reason: string }] }
 */
export const BATCH_JUDGMENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    decisions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          candidateIndex: {
            type: Type.NUMBER,
            description: "Zero-based index of the candidate evaluated (0, 1, 2, ...)",
          },
          decision: {
            type: Type.STRING,
            enum: ["publish", "reject"],
            description: "Whether to publish or reject this topic",
          },
          score: {
            type: Type.NUMBER,
            description:
              "Editorial quality score 0–100. Publish only when score >= 60.",
          },
          reason: {
            type: Type.STRING,
            description:
              "One concise sentence explaining the editorial decision.",
          },
        },
        required: ["candidateIndex", "decision", "score", "reason"],
      },
      description: "List of editorial decisions for each candidate",
    },
  },
  required: ["decisions"],
};

/**
 * Schema for structured news article post generation output.
 */
export const POST_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    headline: {
      type: Type.STRING,
      description: "Compelling, bold news headline summarizing the core research finding.",
    },
    takeaway: {
      type: Type.STRING,
      description: "One-sentence executive summary / core threat takeaway.",
    },
    keyPoints: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "2–3 key bullet takeaways or technical threat implications.",
    },
    text: {
      type: Type.STRING,
      description:
        "Full post prose analysis in Mira Voss's analytical voice (2–3 short, clear, well-spaced paragraphs).",
    },
    rationale: {
      type: Type.STRING,
      description:
        "2–3 sentences: why selected, why matters now, what editorial angle taken.",
    },
    sources: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Source URLs cited — only use URLs provided in the input.",
    },
  },
  required: ["headline", "takeaway", "keyPoints", "text", "rationale", "sources"],
};

// ─── Typed output interfaces ──────────────────────────────────────────────────

export interface BatchCandidateDecision {
  candidateIndex: number;
  decision: "publish" | "reject";
  score: number;
  reason: string;
}

export interface BatchJudgmentOutput {
  decisions: BatchCandidateDecision[];
}

export interface PostOutput {
  headline: string;
  takeaway: string;
  keyPoints: string[];
  text: string;
  rationale: string;
  sources: string[];
}

// ─── Retry helper ─────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parses retryDelay (e.g. "42s" or "42.5s") from Gemini error message if present.
 * Returns delay in milliseconds or null.
 */
function parseRetryDelayMs(errorMsg: string): number | null {
  const match = errorMsg.match(/retryDelay["\s:]+([0-9]+(?:\.[0-9]+)?)s/i);
  if (match && match[1]) {
    const seconds = parseFloat(match[1]);
    if (!isNaN(seconds) && seconds > 0) {
      return Math.ceil(seconds * 1000) + 1000; // Add 1s safety buffer
    }
  }
  return null;
}

/**
 * Call Gemini with structured JSON output.
 * Uses the official @google/genai v1.x API: genai.models.generateContent({ config }).
 * Retries up to 3 times on 429 rate-limit errors using retryDelay or exponential backoff.
 */
export async function generateStructured<T>(opts: {
  systemInstruction: string;
  userContent: string;
  schema: object;
  temperature?: number;
}): Promise<T> {
  const genai = getGenAI();
  const modelName = process.env.GEMINI_MODEL ?? GEMINI_MODEL;
  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await genai.models.generateContent({
        model: modelName,
        contents: opts.userContent,
        config: {
          systemInstruction: opts.systemInstruction,
          responseMimeType: "application/json",
          responseSchema: opts.schema,
          temperature: opts.temperature ?? 0.4,
        },
      });

      const text = response.text;
      if (!text || text.trim().length === 0) {
        throw new Error("Gemini returned an empty response");
      }

      return JSON.parse(text) as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const errMsg = lastError.message ?? "";

      const isRateLimit =
        errMsg.includes("429") ||
        errMsg.toLowerCase().includes("quota") ||
        errMsg.toLowerCase().includes("resource_exhausted");

      if (isRateLimit && attempt < MAX_RETRIES - 1) {
        const retryDelayMs = parseRetryDelayMs(errMsg);
        const backoffMs =
          retryDelayMs ?? Math.pow(2, attempt) * 5000 + Math.random() * 1000; // e.g. 5s, 10s, 20s
        const waitSec = Math.ceil(backoffMs / 1000);

        console.warn(`[Judge] Gemini 429 — retrying after ${waitSec} seconds`);
        await sleep(backoffMs);
        continue;
      }

      throw lastError;
    }
  }

  throw lastError ?? new Error("Gemini API request failed after max retries");
}
