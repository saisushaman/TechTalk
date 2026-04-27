import { chat, safeParseJson } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You are an opinionated AI model selector for a working developer.

You will receive a project context, an optional eval context (a sub-task they want a model for), and either:
- A list of specific models to compare (mode: "compare"), OR
- An empty list, in which case you SUGGEST 3-4 models that genuinely fit (mode: "suggest").

For each model in your output, produce a structured assessment for THIS person's project. Be honest. Penalize models that don't fit even if they're popular. Reward models that fit even if they're niche. Always factor in:
- Hosting / sovereignty (HIPAA BAA, EU residency, on-prem viability) when the project context implies it matters
- Latency vs reasoning tradeoff for the use case
- Cost realism for the project's stage
- License (open vs proprietary) when sovereignty matters

Output ONLY a JSON object with this exact shape:
{
  "mode": "compare" | "suggest",
  "models": [
    {
      "name": "the canonical model id you'd use in code, e.g. claude-haiku-4-5-20251001",
      "displayName": "Friendly name e.g. Claude Haiku 4.5",
      "provider": "Anthropic | OpenAI | Google | Meta | Mistral | Groq | Hugging Face | self-hosted | other",
      "snapshot": "1-2 sentence neutral description of what this model is.",
      "strengths": ["short", "bullet", "list"],
      "weaknesses": ["short", "bullet", "list"],
      "contextWindow": "approximate (e.g. '200k tokens' or 'unknown - per docs')",
      "approxPrice": "approximate per-1M-token pricing if known, else 'open weights / self-hosted' or 'unknown - check current pricing'",
      "license": "proprietary | open weights | research-only | depends on host",
      "hipaaBaa": "Available via Azure OpenAI | Available via AWS Bedrock | Not available | Self-hosting required for HIPAA | Unknown",
      "bestFor": ["chat", "tool use", "long context", "reasoning", "structured output", "low-latency", "agents", "code", etc.],
      "fitVerdict": "strong fit" | "worth exploring" | "not right now" | "avoid",
      "fitReasoning": "1 short paragraph (3-5 sentences) tying this model directly to the project context, stack, and eval context. Mention concrete tradeoffs."
    }
  ],
  "summary": "1-2 sentences comparing the models for this project. Honest about which one wins for what.",
  "recommendation": "the 'name' of the model you'd pick, or null if none of these fit"
}

Critical rules:
- Never invent capabilities or numbers. If you're not sure of a spec, write 'unknown - check current pricing' or similar. Better to be honest than confidently wrong.
- For "suggest" mode, pick 3-4 genuinely different models that span the design space (e.g. one fast/cheap, one smart/expensive, one open-weight, one specialized) — don't suggest 4 variants of the same family.
- For "compare" mode, evaluate every model the user asked about, in the order given.
- Never add prose outside the JSON. Never use markdown fences.`;

function buildContext({ project, evalContext }) {
  const p = project || {};
  const lines = [];
  lines.push("PROJECT:");
  lines.push(`- Building: ${p.building || "(not specified)"}`);
  lines.push(`- Stack: ${p.stack || "(not specified)"}`);
  lines.push(`- Stage: ${p.stage || "(not specified)"}`);
  lines.push(`- Curious about: ${p.curiosity || "(not specified)"}`);
  if (p.stuckOn) lines.push(`- Stuck on: ${p.stuckOn}`);
  if (p.preferences) {
    lines.push("");
    lines.push("PREFERENCES:");
    lines.push(p.preferences);
  }
  if (evalContext && evalContext.trim()) {
    lines.push("");
    lines.push("EVAL CONTEXT (the specific use case they want a model for - prioritize this):");
    lines.push(evalContext.trim());
  }
  return lines.join("\n");
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const project = body.project || null;
    const evalContext = typeof body.evalContext === "string" ? body.evalContext : "";
    const modelNames = Array.isArray(body.modelNames)
      ? body.modelNames
          .map((m) => String(m || "").trim())
          .filter((m) => m.length > 0 && m.length < 100)
          .slice(0, 6)
      : [];

    const ctx = buildContext({ project, evalContext });
    const mode = modelNames.length > 0 ? "compare" : "suggest";

    let userPrompt;
    if (mode === "compare") {
      const numbered = modelNames.map((m, i) => `${i + 1}. ${m}`).join("\n");
      userPrompt = `${ctx}

MODE: compare
MODELS TO EVALUATE (in this order):
${numbered}

For each model, produce its assessment for this project. Then write the summary and recommendation.`;
    } else {
      userPrompt = `${ctx}

MODE: suggest
The user has not named specific models. Recommend 3-4 models that genuinely fit this project. Span the design space - don't suggest 4 variants of the same family.`;
    }

    const raw = await chat({
      system: SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
      json: true,
      maxTokens: 2000,
    });
    const parsed = safeParseJson(raw);
    if (!parsed || !Array.isArray(parsed.models)) {
      return Response.json(
        { error: "Model returned an unexpected response.", raw: raw?.slice?.(0, 500) },
        { status: 502 },
      );
    }

    // Coerce shapes defensively.
    const models = parsed.models.map((m) => ({
      name: String(m?.name || "").slice(0, 120),
      displayName: String(m?.displayName || m?.name || "").slice(0, 120),
      provider: String(m?.provider || "unknown").slice(0, 60),
      snapshot: String(m?.snapshot || "").slice(0, 600),
      strengths: Array.isArray(m?.strengths) ? m.strengths.slice(0, 6).map(String) : [],
      weaknesses: Array.isArray(m?.weaknesses) ? m.weaknesses.slice(0, 6).map(String) : [],
      contextWindow: String(m?.contextWindow || "unknown").slice(0, 80),
      approxPrice: String(m?.approxPrice || "unknown").slice(0, 120),
      license: String(m?.license || "unknown").slice(0, 60),
      hipaaBaa: String(m?.hipaaBaa || "unknown").slice(0, 120),
      bestFor: Array.isArray(m?.bestFor) ? m.bestFor.slice(0, 8).map(String) : [],
      fitVerdict: String(m?.fitVerdict || "worth exploring").toLowerCase(),
      fitReasoning: String(m?.fitReasoning || "").slice(0, 1200),
    }));

    return Response.json({
      mode,
      models,
      summary: String(parsed.summary || "").slice(0, 800),
      recommendation: parsed.recommendation ? String(parsed.recommendation).slice(0, 120) : null,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("eval/compare error:", err);
    return Response.json(
      { error: err.message || "evaluation failed" },
      { status: 500 },
    );
  }
}
