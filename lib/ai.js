// Provider-agnostic chat adapter.
// Swap between OpenAI-compatible endpoints (OpenAI, Gemini, Groq, OpenRouter,
// Ollama, together.ai) and Anthropic with the AI_PROVIDER + OPENAI_BASE_URL
// env vars. No SDK dependency - uses fetch directly so the project stays lean.
//
// Includes automatic retry-with-backoff on transient errors (429, 5xx, network
// blips). Handy for Gemini's "high demand" overloads and Groq rate limits.

const PROVIDER = (process.env.AI_PROVIDER || "openai").toLowerCase();

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

const OPENAI_BASE_URL = (
  process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
).replace(/\/+$/, "");

// Retry config
const RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1000, 2000, 4000]; // for attempts 1, 2, 3

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * fetch() with automatic retry on transient failures.
 * Retries on: 408/425/429/500/502/503/504 and network errors.
 * Does NOT retry: 400/401/403/404/422 (real errors that won't fix themselves).
 */
async function fetchWithRetry(url, init, label = "request") {
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;
      if (!RETRY_STATUSES.has(res.status)) return res; // permanent error - bail
      const errText = await res.text().catch(() => "");
      lastErr = new Error(`${label} ${res.status}: ${errText.slice(0, 200)}`);
      // attach status so caller can format nicely if all retries fail
      lastErr.status = res.status;
      lastErr.body = errText;
    } catch (e) {
      // network-level error (DNS, abort, timeout) - retry
      lastErr = e;
    }
    if (attempt < MAX_ATTEMPTS) {
      const wait = BACKOFF_MS[attempt - 1] || 4000;
      console.warn(
        `[ai] ${label} attempt ${attempt} failed (${lastErr?.status || "network"}), retrying in ${wait}ms...`,
      );
      await sleep(wait);
    }
  }
  throw lastErr || new Error(`${label} failed after ${MAX_ATTEMPTS} attempts`);
}

/**
 * chat({ system, messages, json, maxTokens })
 * Returns: string (the assistant's reply text)
 */
export async function chat({
  system,
  messages,
  json = false,
  maxTokens = 700,
}) {
  if (PROVIDER === "anthropic")
    return callAnthropic({ system, messages, json, maxTokens });
  if (PROVIDER === "openai")
    return callOpenAI({ system, messages, json, maxTokens });
  throw new Error(
    `Unknown AI_PROVIDER "${PROVIDER}". Use "openai" or "anthropic".`,
  );
}

async function callOpenAI({ system, messages, json, maxTokens }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");

  const sys = json
    ? `${system || ""}\n\nRespond with ONLY a valid JSON object. No prose, no markdown fences.`
    : system;

  const body = {
    model: OPENAI_MODEL,
    messages: [
      ...(sys ? [{ role: "system", content: sys }] : []),
      ...messages,
    ],
    max_tokens: maxTokens,
    temperature: 0.7,
  };
  if (json) body.response_format = { type: "json_object" };

  let res;
  try {
    res = await fetchWithRetry(
      `${OPENAI_BASE_URL}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
      },
      `OpenAI-compatible (${OPENAI_BASE_URL})`,
    );
  } catch (err) {
    throw new Error(
      `OpenAI-compatible endpoint (${OPENAI_BASE_URL}) ${err.message || err}`,
    );
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `OpenAI-compatible endpoint (${OPENAI_BASE_URL}) error ${res.status}: ${errText}`,
    );
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

async function callAnthropic({ system, messages, json, maxTokens }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");

  const sys = json
    ? `${system || ""}\n\nRespond with ONLY a valid JSON object. No prose before or after.`
    : system;

  const body = {
    model: ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    temperature: 0.7,
    ...(sys ? { system: sys } : {}),
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };

  let res;
  try {
    res = await fetchWithRetry(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      },
      "Anthropic",
    );
  } catch (err) {
    throw new Error(`Anthropic ${err.message || err}`);
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const text = (data.content || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("")
    .trim();
  return text;
}

/**
 * Forgiving JSON parser for model output. Strips markdown fences and
 * extracts the first {...} block if there's stray prose around it.
 */
export function safeParseJson(raw) {
  if (!raw) return null;
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(s);
  } catch {
    const first = s.indexOf("{");
    const last = s.lastIndexOf("}");
    if (first !== -1 && last !== -1 && last > first) {
      try {
        return JSON.parse(s.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function currentProvider() {
  return PROVIDER;
}
