// Provider-agnostic chat adapter.
//
// Two ways to use it:
//   1. chat({ ... })            - uses the DEFAULT provider configured via
//                                  AI_PROVIDER + OPENAI_BASE_URL env vars.
//                                  Backward compatible.
//   2. chatWithModel(modelName, { ... })
//                               - auto-routes based on model name to whichever
//                                  provider env keys you have set. All keys are
//                                  OPTIONAL - only set the ones you want.
//
// Includes automatic retry-with-backoff on transient errors (429, 5xx, network).

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
const BACKOFF_MS = [1000, 2000, 4000];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url, init, label = "request") {
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;
      if (!RETRY_STATUSES.has(res.status)) return res;
      const errText = await res.text().catch(() => "");
      lastErr = new Error(`${label} ${res.status}: ${errText.slice(0, 200)}`);
      lastErr.status = res.status;
      lastErr.body = errText;
    } catch (e) {
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

// ---------------------------------------------------------------------------
// Backward-compatible default-provider chat()
// ---------------------------------------------------------------------------

export async function chat({
  system,
  messages,
  json = false,
  maxTokens = 700,
  model,
}) {
  if (PROVIDER === "anthropic")
    return callAnthropicWith({
      system, messages, json, maxTokens,
      model: model || ANTHROPIC_MODEL,
      key: process.env.ANTHROPIC_API_KEY,
    });
  if (PROVIDER === "openai")
    return callOpenAIWith({
      system, messages, json, maxTokens,
      model: model || OPENAI_MODEL,
      key: process.env.OPENAI_API_KEY,
      baseUrl: OPENAI_BASE_URL,
    });
  throw new Error(
    `Unknown AI_PROVIDER "${PROVIDER}". Use "openai" or "anthropic".`,
  );
}

// ---------------------------------------------------------------------------
// Multi-provider routing
// ---------------------------------------------------------------------------

/**
 * Detect which provider a model name belongs to.
 * Heuristic - works for the common naming conventions.
 */
export function detectProvider(modelName) {
  const m = String(modelName || "").toLowerCase().trim();
  if (!m) return "default";
  if (m.includes("claude")) return "anthropic";
  if (m.startsWith("gpt-") || m.startsWith("o1-") || m.startsWith("o3-")) return "openai-direct";
  if (m.startsWith("gemini")) return "gemini";
  if (
    m.startsWith("llama") ||
    m.includes("mixtral") ||
    m.startsWith("qwen") ||
    m.startsWith("deepseek") ||
    m.startsWith("kimi")
  ) return "groq";
  return "default";
}

/**
 * Resolve a provider key + base url for a given provider tag.
 * All keys are OPTIONAL. Returns { key, baseUrl, flavor } or { key: null }
 * if no key is configured for that provider.
 */
function resolveProvider(provider) {
  switch (provider) {
    case "anthropic":
      return {
        key: process.env.ANTHROPIC_API_KEY || null,
        baseUrl: "https://api.anthropic.com/v1/messages",
        flavor: "anthropic",
        envName: "ANTHROPIC_API_KEY",
      };
    case "openai-direct":
      return {
        key: process.env.OPENAI_API_KEY_DIRECT || null,
        baseUrl: "https://api.openai.com/v1",
        flavor: "openai",
        envName: "OPENAI_API_KEY_DIRECT",
      };
    case "gemini":
      return {
        key: process.env.GEMINI_API_KEY || null,
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        flavor: "openai",
        envName: "GEMINI_API_KEY",
      };
    case "groq":
      return {
        key: process.env.GROQ_API_KEY || null,
        baseUrl: "https://api.groq.com/openai/v1",
        flavor: "openai",
        envName: "GROQ_API_KEY",
      };
    case "default":
    default:
      // Fall back to whatever the user configured as their default
      if (PROVIDER === "anthropic") {
        return {
          key: process.env.ANTHROPIC_API_KEY || null,
          baseUrl: "https://api.anthropic.com/v1/messages",
          flavor: "anthropic",
          envName: "ANTHROPIC_API_KEY (default provider)",
        };
      }
      return {
        key: process.env.OPENAI_API_KEY || null,
        baseUrl: OPENAI_BASE_URL,
        flavor: "openai",
        envName: "OPENAI_API_KEY (default provider)",
      };
  }
}

/**
 * Same shape as chat(), but auto-routes based on model name.
 * Use when you need to call a specific model that may live on a different
 * provider than the default.
 */
export async function chatWithModel(modelName, opts = {}) {
  const provider = detectProvider(modelName);
  const cfg = resolveProvider(provider);
  if (!cfg.key) {
    throw new Error(
      `No API key configured for "${modelName}" (detected provider: ${provider}). Set the ${cfg.envName} env var to enable this model.`,
    );
  }
  if (cfg.flavor === "anthropic") {
    return callAnthropicWith({
      ...opts,
      model: modelName,
      key: cfg.key,
    });
  }
  return callOpenAIWith({
    ...opts,
    model: modelName,
    key: cfg.key,
    baseUrl: cfg.baseUrl,
  });
}

/**
 * Returns which provider keys are configured. Used by the UI to show what's
 * reachable and warn the user before they try a model that won't work.
 */
export function configuredProviders() {
  return {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    "openai-direct": !!process.env.OPENAI_API_KEY_DIRECT,
    gemini: !!process.env.GEMINI_API_KEY,
    groq: !!process.env.GROQ_API_KEY,
    default: !!process.env.OPENAI_API_KEY,
    defaultProvider: PROVIDER,
    defaultBaseUrl: OPENAI_BASE_URL,
  };
}

// ---------------------------------------------------------------------------
// Internal callers (parameterized, can be reused by chat() and chatWithModel)
// ---------------------------------------------------------------------------

async function callOpenAIWith({
  system, messages, json, maxTokens, model, key, baseUrl,
}) {
  if (!key) throw new Error("API key is missing for this OpenAI-compatible call");

  const sys = json
    ? `${system || ""}\n\nRespond with ONLY a valid JSON object. No prose, no markdown fences.`
    : system;

  const body = {
    model,
    messages: [
      ...(sys ? [{ role: "system", content: sys }] : []),
      ...messages,
    ],
    max_tokens: maxTokens || 700,
    temperature: 0.7,
  };
  if (json) body.response_format = { type: "json_object" };

  let res;
  try {
    res = await fetchWithRetry(
      `${baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
      },
      `OpenAI-compatible (${baseUrl})`,
    );
  } catch (err) {
    throw new Error(
      `OpenAI-compatible endpoint (${baseUrl}) ${err.message || err}`,
    );
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `OpenAI-compatible endpoint (${baseUrl}) error ${res.status}: ${errText}`,
    );
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

async function callAnthropicWith({
  system, messages, json, maxTokens, model, key,
}) {
  if (!key) throw new Error("ANTHROPIC_API_KEY is missing for this Anthropic call");

  const sys = json
    ? `${system || ""}\n\nRespond with ONLY a valid JSON object. No prose before or after.`
    : system;

  const body = {
    model,
    max_tokens: maxTokens || 700,
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

// ---------------------------------------------------------------------------
// Forgiving JSON parser
// ---------------------------------------------------------------------------

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
