import { chat, chatWithModel, safeParseJson } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

const SEED_SYSTEM = `You design empirical test prompts that measure how well an AI model would perform on a specific user's project use case.

You will receive the user's project context and an eval context. Output 3 short, concrete test prompts that, when answered, would let us judge whether a model is fit for THIS use case.

Each prompt should:
- Be self-contained (include any input data needed, even if synthetic)
- Be answerable in 100-300 tokens
- Test a different capability or failure mode (one easy, one tricky, one edge case)
- Reflect the actual use case, not generic LLM benchmarks

Output ONLY JSON: { "prompts": ["prompt 1...", "prompt 2...", "prompt 3..."] }`;

const JUDGE_SYSTEM = `You are a strict judge of AI model outputs.

You will receive: a test prompt, the model's output, and the user's project context. Score the output across four axes 1-5 (5 = best). Be honest. Penalize hallucinations and format breaks heavily.

Axes:
- accuracy: Is the substance correct given the prompt? (5 = correct, 1 = wrong)
- hallucinationFreedom: Free of made-up facts/figures? (5 = clean, 1 = many fabrications)
- format: Does the output structure match what was asked? (5 = perfect, 1 = broken)
- usefulness: Would this output actually help the project context? (5 = directly useful, 1 = noise)

Output ONLY JSON: {
  "accuracy": 1-5, "hallucinationFreedom": 1-5, "format": 1-5, "usefulness": 1-5,
  "notes": "1-2 sentences explaining the scores"
}`;

function buildContext({ project, evalContext }) {
  const p = project || {};
  const lines = [];
  lines.push("PROJECT:");
  lines.push(`- Building: ${p.building || "(not specified)"}`);
  lines.push(`- Stack: ${p.stack || "(not specified)"}`);
  lines.push(`- Stage: ${p.stage || "(not specified)"}`);
  if (p.curiosity) lines.push(`- Curious about: ${p.curiosity}`);
  if (p.stuckOn) lines.push(`- Stuck on: ${p.stuckOn}`);
  if (p.preferences) {
    lines.push("");
    lines.push("PREFERENCES:");
    lines.push(p.preferences);
  }
  if (evalContext && evalContext.trim()) {
    lines.push("");
    lines.push("EVAL CONTEXT (priority - the specific use case):");
    lines.push(evalContext.trim());
  }
  return lines.join("\n");
}

async function seedPrompts({ project, evalContext }) {
  const ctx = buildContext({ project, evalContext });
  const userPrompt = `${ctx}\n\nDesign 3 test prompts (easy / tricky / edge case) that would let us judge a model's fit for this use case.`;
  const raw = await chat({
    system: SEED_SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
    json: true,
    maxTokens: 700,
  });
  const parsed = safeParseJson(raw);
  if (!parsed || !Array.isArray(parsed.prompts)) {
    return { prompts: [] };
  }
  return {
    prompts: parsed.prompts
      .map((p) => String(p || "").trim())
      .filter((p) => p.length > 5)
      .slice(0, 3),
  };
}

async function runOne({ modelName, prompt }) {
  const t0 = performance.now();
  let output = "";
  let error = null;
  try {
    // Use chatWithModel so the call routes to the RIGHT provider for that model
    // (Anthropic for claude-*, Gemini for gemini-*, Groq for llama-*, etc.)
    output = await chatWithModel(modelName, {
      system:
        "You are answering a test prompt. Respond clearly and concisely. If the prompt requires data the user hasn't provided, say so explicitly rather than fabricating.",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 500,
    });
  } catch (e) {
    error = e?.message || String(e);
  }
  const latencyMs = Math.round(performance.now() - t0);
  return { output, error, latencyMs };
}

async function judgeOne({ project, prompt, output }) {
  const ctx = buildContext({ project, evalContext: "" });
  const userPrompt = `${ctx}

TEST PROMPT:
${prompt}

MODEL OUTPUT:
${output}

Now score this output across the four axes.`;
  try {
    const raw = await chat({
      system: JUDGE_SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
      json: true,
      maxTokens: 400,
    });
    const parsed = safeParseJson(raw);
    if (!parsed) return null;
    const clamp = (n) => {
      const v = Number(n);
      if (!Number.isFinite(v)) return null;
      return Math.max(1, Math.min(5, Math.round(v)));
    };
    return {
      accuracy: clamp(parsed.accuracy),
      hallucinationFreedom: clamp(parsed.hallucinationFreedom),
      format: clamp(parsed.format),
      usefulness: clamp(parsed.usefulness),
      notes: String(parsed.notes || "").slice(0, 400),
    };
  } catch (err) {
    console.warn("judge failed:", err?.message || err);
    return null;
  }
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "run";
    const project = body.project || null;
    const evalContext = typeof body.evalContext === "string" ? body.evalContext : "";

    if (mode === "seed") {
      const out = await seedPrompts({ project, evalContext });
      return Response.json(out);
    }

    if (mode !== "run") {
      return Response.json({ error: "Unknown mode" }, { status: 400 });
    }

    const modelName = String(body.modelName || "").trim();
    if (!modelName) {
      return Response.json({ error: "modelName is required" }, { status: 400 });
    }
    const testPrompts = Array.isArray(body.testPrompts)
      ? body.testPrompts.map((p) => String(p || "").trim()).filter((p) => p.length > 5).slice(0, 5)
      : [];
    if (testPrompts.length === 0) {
      return Response.json({ error: "Provide at least one test prompt." }, { status: 400 });
    }

    // Run all prompts against the model in sequence (small N, easier to reason about latency)
    const runs = [];
    for (const prompt of testPrompts) {
      const r = await runOne({ modelName, prompt });
      runs.push({ prompt, ...r });
    }

    // Judge each run that succeeded
    const judged = await Promise.all(
      runs.map(async (r) => {
        if (r.error) return { ...r, scores: null };
        const scores = await judgeOne({ project, prompt: r.prompt, output: r.output });
        return { ...r, scores };
      }),
    );

    // Aggregate
    const successful = judged.filter((r) => r.scores && !r.error);
    const avg = (key) =>
      successful.length === 0
        ? null
        : Math.round(
            (successful.reduce((s, r) => s + (r.scores[key] || 0), 0) /
              successful.length) *
              10,
          ) / 10;
    const overall = successful.length === 0
      ? null
      : Math.round(
          ((avg("accuracy") + avg("hallucinationFreedom") + avg("format") + avg("usefulness")) / 4) * 10,
        ) / 10;
    const avgLatency = runs.length === 0
      ? null
      : Math.round(runs.reduce((s, r) => s + r.latencyMs, 0) / runs.length);

    return Response.json({
      modelName,
      results: judged,
      summary: {
        accuracy: avg("accuracy"),
        hallucinationFreedom: avg("hallucinationFreedom"),
        format: avg("format"),
        usefulness: avg("usefulness"),
        overall,
        avgLatencyMs: avgLatency,
        promptsRun: runs.length,
        successful: successful.length,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("benchmark error:", err);
    return Response.json(
      { error: err.message || "benchmark failed" },
      { status: 500 },
    );
  }
}
