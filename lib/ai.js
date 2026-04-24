// Provider-agnostic chat adapter.
// Swap between OpenAI-compatible endpoints (OpenAI, Gemini, Groq, OpenRouter,
// Ollama, together.ai) and Anthropic with the AI_PROVIDER + OPENAI_BASE_URL
// env vars. No SDK dependency - uses fetch directly so the project stays lean.

const PROVIDER = (process.env.AI_PROVIDER || "openai").toLowerCase();

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

// Any OpenAI-compatible endpoint. Leave unset to hit OpenAI itself.
// Gemini:     https://generativelanguage.googleapis.com/v1beta/openai
// Groq:       https://api.groq.com/openai/v1
// OpenRouter: https://openrouter.ai/api/v1
// Ollama:     http://localhost:11434/v1
const OPENAI_BASE_URL = (
  process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
).replace(/\/+$/, "");

/**
 * chat({ system, messages, json, maxTokens })
 * - system: string - the system prompt
 * - messages: [{ role: "user" | "assistant", content: string }]
 * - json: boolean - ask the model to return a JSON object
 * - maxTokens: number
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

  // Belt-and-suspenders JSON: nudge via system prompt AND set response_format.
  // Some compatible endpoints (incl. Gemini's OpenAI-compat layer) ignore
  // response_format - the prompt nudge + safeParseJson() handle that.
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

  const res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(
      `OpenAI-compatible endpoint (${OPENAI_BASE_URL}) error ${res.status}: ${err}`,
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

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic error ${res.status}: ${err}`);
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
 * extracts the first {...} block if there is stray prose around it.
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
