"use client";

import { useEffect, useState } from "react";
import { getProject } from "@/lib/journal";

const VERDICT_STYLES = {
  "strong fit": { bg: "rgba(62,207,142,0.18)", fg: "#3ecf8e", border: "#2a8e65", label: "Strong fit" },
  "worth exploring": { bg: "rgba(124,92,255,0.18)", fg: "#a191ff", border: "#5a3dff", label: "Worth exploring" },
  "not right now": { bg: "rgba(200,90,90,0.15)", fg: "#e08a8a", border: "#7a3b3b", label: "Not right now" },
  avoid: { bg: "rgba(220,80,80,0.22)", fg: "#ff8a8a", border: "#a33", label: "Avoid" },
};

function VerdictBadge({ verdict }) {
  const s = VERDICT_STYLES[verdict] || VERDICT_STYLES["worth exploring"];
  return (
    <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border"
      style={{ background: s.bg, color: s.fg, borderColor: s.border }}>
      {s.label}
    </span>
  );
}

function ScoreBar({ label, value }) {
  const v = value == null ? 0 : Math.max(0, Math.min(5, value));
  const pct = (v / 5) * 100;
  const color = v >= 4 ? "#3ecf8e" : v >= 3 ? "#a191ff" : v >= 2 ? "#e0b86c" : "#e08a8a";
  return (
    <div className="text-xs">
      <div className="flex justify-between">
        <span className="text-mute">{label}</span>
        <span className="text-ink/90">{value == null ? "—" : value.toFixed(1)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-black/30 overflow-hidden mt-1">
        <div style={{ width: `${pct}%`, background: color }} className="h-full" />
      </div>
    </div>
  );
}

function BenchmarkPanel({ model, project, evalContext }) {
  const [open, setOpen] = useState(false);
  const [prompts, setPrompts] = useState(["", "", ""]);
  const [seeding, setSeeding] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function seed() {
    setSeeding(true);
    setError("");
    try {
      const res = await fetch("/api/eval/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "seed", project, evalContext }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Seed failed");
      const seeded = (data.prompts || []).slice(0, 3);
      while (seeded.length < 3) seeded.push("");
      setPrompts(seeded);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setSeeding(false);
    }
  }

  async function run() {
    const cleaned = prompts.map((p) => p.trim()).filter((p) => p.length > 5);
    if (cleaned.length === 0) {
      setError("Add at least one test prompt (min 6 chars).");
      return;
    }
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/eval/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "run",
          project,
          evalContext,
          modelName: model.name,
          testPrompts: cleaned,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Run failed");
      setResult(data);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setRunning(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs btn btn-ghost"
      >
        Run real benchmark on {model.displayName} →
      </button>
    );
  }

  return (
    <div className="mt-3 border-t border-edge pt-3 space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-mute">
            Real benchmark — {model.displayName}
          </div>
          <div className="text-[11px] text-mute mt-1">
            Runs your test prompts directly against this model and has a judge LLM score the outputs.
            Uses your configured provider — if the model isn&apos;t reachable from it, you&apos;ll see an error per prompt.
          </div>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-[11px] text-mute hover:text-ink"
        >
          Close
        </button>
      </div>

      <div className="space-y-2">
        {prompts.map((p, i) => (
          <textarea
            key={i}
            value={p}
            onChange={(e) => {
              const next = [...prompts];
              next[i] = e.target.value;
              setPrompts(next);
            }}
            rows={2}
            placeholder={`Test prompt ${i + 1}`}
            className="w-full bg-black/20 border border-edge rounded-lg p-2 text-xs outline-none focus:border-accent/60"
          />
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={seed}
          disabled={seeding || running}
          className="btn btn-ghost text-xs disabled:opacity-50"
        >
          {seeding ? "Generating..." : "Generate test prompts"}
        </button>
        <button
          onClick={run}
          disabled={running || seeding}
          className="btn btn-primary text-xs disabled:opacity-50"
        >
          {running ? "Running..." : "Run benchmark"}
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded p-2">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          {result.summary && (
            <div className="bg-black/30 border border-edge rounded-lg p-3 space-y-2">
              <div className="text-[11px] uppercase tracking-wider text-mute">
                Aggregate scores ({result.summary.successful}/{result.summary.promptsRun} prompts succeeded)
                {result.summary.avgLatencyMs != null && (
                  <span className="ml-2 text-mute">
                    · avg latency {result.summary.avgLatencyMs}ms
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <ScoreBar label="Accuracy" value={result.summary.accuracy} />
                <ScoreBar label="Hallucination-free" value={result.summary.hallucinationFreedom} />
                <ScoreBar label="Format" value={result.summary.format} />
                <ScoreBar label="Usefulness" value={result.summary.usefulness} />
              </div>
              {result.summary.overall != null && (
                <div className="text-sm text-ink/90 pt-1 border-t border-edge">
                  Overall:{" "}
                  <span className={
                    result.summary.overall >= 4 ? "text-accent2" :
                    result.summary.overall >= 3 ? "text-accent" :
                    "text-red-300"
                  }>
                    <strong>{result.summary.overall.toFixed(1)} / 5</strong>
                  </span>
                </div>
              )}
            </div>
          )}

          {result.results.map((r, i) => (
            <details
              key={i}
              className="bg-black/20 border border-edge rounded-lg p-2 text-xs"
            >
              <summary className="cursor-pointer text-ink/80">
                <strong>Prompt {i + 1}</strong>
                {r.error ? (
                  <span className="ml-2 text-red-300">— error</span>
                ) : r.scores ? (
                  <span className="ml-2 text-mute">
                    — A:{r.scores.accuracy} H:{r.scores.hallucinationFreedom} F:{r.scores.format} U:{r.scores.usefulness}
                    · {r.latencyMs}ms
                  </span>
                ) : (
                  <span className="ml-2 text-mute">— unscored</span>
                )}
              </summary>
              <div className="mt-2 space-y-2">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-mute">Prompt</div>
                  <pre className="text-[11px] text-ink/80 whitespace-pre-wrap mt-1">{r.prompt}</pre>
                </div>
                {r.error ? (
                  <div className="text-red-300 text-[11px]">Error: {r.error}</div>
                ) : (
                  <>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-mute">Output</div>
                      <pre className="text-[11px] text-ink/80 whitespace-pre-wrap mt-1">{r.output}</pre>
                    </div>
                    {r.scores?.notes && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-mute">Judge notes</div>
                        <p className="text-[11px] text-ink/80 mt-1">{r.scores.notes}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

function ModelCard({ model, isPick, project, evalContext }) {
  return (
    <article
      className={`card p-5 space-y-3 ${isPick ? "border-accent2/60" : ""}`}
      style={isPick ? { boxShadow: "0 0 0 1px rgba(62,207,142,0.4)" } : {}}
    >
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-mute">
            {model.provider}
            {isPick && <span className="ml-2 text-accent2">★ AI&apos;s pick</span>}
          </div>
          <div className="text-lg font-semibold mt-0.5">{model.displayName}</div>
          <code className="text-[11px] text-mute">{model.name}</code>
        </div>
        <VerdictBadge verdict={model.fitVerdict} />
      </header>

      {model.snapshot && (
        <p className="text-sm text-ink/90 leading-relaxed">{model.snapshot}</p>
      )}

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-black/20 border border-edge rounded p-2">
          <div className="text-mute text-[10px] uppercase tracking-wider">Context</div>
          <div className="mt-0.5 text-ink/90">{model.contextWindow}</div>
        </div>
        <div className="bg-black/20 border border-edge rounded p-2">
          <div className="text-mute text-[10px] uppercase tracking-wider">Pricing</div>
          <div className="mt-0.5 text-ink/90">{model.approxPrice}</div>
        </div>
        <div className="bg-black/20 border border-edge rounded p-2">
          <div className="text-mute text-[10px] uppercase tracking-wider">License</div>
          <div className="mt-0.5 text-ink/90">{model.license}</div>
        </div>
        <div className="bg-black/20 border border-edge rounded p-2">
          <div className="text-mute text-[10px] uppercase tracking-wider">HIPAA / BAA</div>
          <div className="mt-0.5 text-ink/90">{model.hipaaBaa}</div>
        </div>
      </div>

      {(model.strengths?.length > 0 || model.weaknesses?.length > 0) && (
        <div className="grid sm:grid-cols-2 gap-3">
          {model.strengths?.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-accent2 mb-1">Strengths</div>
              <ul className="text-xs text-ink/90 space-y-0.5">
                {model.strengths.map((s, i) => (<li key={i}>+ {s}</li>))}
              </ul>
            </div>
          )}
          {model.weaknesses?.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-red-300 mb-1">Weaknesses</div>
              <ul className="text-xs text-ink/90 space-y-0.5">
                {model.weaknesses.map((s, i) => (<li key={i}>− {s}</li>))}
              </ul>
            </div>
          )}
        </div>
      )}

      {model.bestFor?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {model.bestFor.map((b, i) => (
            <span key={i} className="text-[10px] text-mute bg-black/30 border border-edge rounded-full px-2 py-0.5">
              {b}
            </span>
          ))}
        </div>
      )}

      {model.fitReasoning && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-mute mb-1">Fit for your project</div>
          <p className="text-sm text-ink/90 leading-relaxed whitespace-pre-line">{model.fitReasoning}</p>
        </div>
      )}

      {/* Per-model real benchmark trigger */}
      <BenchmarkPanel model={model} project={project} evalContext={evalContext} />
    </article>
  );
}

// Mirrors detectProvider() in lib/ai.js for client-side chip labels.
function detectProviderClient(modelName) {
  const m = String(modelName || "").toLowerCase().trim();
  if (!m) return "default";
  if (m.includes("claude")) return "anthropic";
  if (m.startsWith("gpt-") || m.startsWith("o1-") || m.startsWith("o3-")) return "openai-direct";
  if (m.startsWith("gemini")) return "gemini";
  if (
    m.startsWith("llama") || m.includes("mixtral") || m.startsWith("qwen") ||
    m.startsWith("deepseek") || m.startsWith("kimi")
  ) return "groq";
  return "default";
}

const PROVIDER_LABEL = {
  anthropic: "Anthropic",
  "openai-direct": "OpenAI",
  gemini: "Gemini",
  groq: "Groq",
  default: "Default",
};

function isProviderReachable(provider, providers) {
  if (!providers) return null;
  if (provider === "default") return providers.default;
  return !!providers[provider];
}

function ProviderStatusBar({ providers }) {
  if (!providers) return null;
  const rows = [
    { key: "default", label: `Default (${providers.defaultProvider || "—"})`, ok: providers.default },
    { key: "anthropic", label: "Anthropic", ok: providers.anthropic },
    { key: "openai-direct", label: "OpenAI direct", ok: providers["openai-direct"] },
    { key: "gemini", label: "Gemini", ok: providers.gemini },
    { key: "groq", label: "Groq", ok: providers.groq },
  ];
  return (
    <div className="card p-3 flex flex-wrap items-center gap-2 text-xs">
      <span className="text-mute uppercase tracking-wider">Providers:</span>
      {rows.map((r) => (
        <span
          key={r.key}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${
            r.ok
              ? "bg-accent2/15 border-accent2/40 text-accent2"
              : "bg-black/20 border-edge text-mute"
          }`}
          title={r.ok ? "Key configured" : "No key set"}
        >
          {r.ok ? "✓" : "·"} {r.label}
        </span>
      ))}
      <span className="text-mute text-[11px] w-full mt-1">
        Add provider keys in <code>.env.local</code> (all optional) to unlock
        more model families for benchmarking.
      </span>
    </div>
  );
}

export default function EvalPage() {
  const [project, setProjectState] = useState(undefined);
  const [evalContext, setEvalContext] = useState("");
  const [modelInput, setModelInput] = useState("");
  const [modelNames, setModelNames] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [providers, setProviders] = useState(null);

  useEffect(() => {
    const p = getProject();
    setProjectState(p);
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const m = params.get("model");
      if (m) setModelNames([m]);
      const ctx = params.get("ctx");
      if (ctx) setEvalContext(ctx);
    }
    fetch("/api/providers")
      .then((r) => r.json())
      .then((data) => setProviders(data))
      .catch(() => setProviders(null));
  }, []);

  function addModel() {
    const t = modelInput.trim();
    if (!t) return;
    if (modelNames.includes(t)) { setModelInput(""); return; }
    setModelNames((prev) => [...prev, t].slice(0, 6));
    setModelInput("");
  }

  function removeModel(idx) {
    setModelNames((prev) => prev.filter((_, i) => i !== idx));
  }

  async function run({ suggest = false } = {}) {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/eval/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project,
          evalContext,
          modelNames: suggest ? [] : modelNames,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Eval failed");
      setResult(data);
      if (suggest && Array.isArray(data.models) && modelNames.length === 0) {
        setModelNames(data.models.map((m) => m.name).slice(0, 6));
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  if (project === undefined) {
    return <div className="card p-5 opacity-60"><div className="text-sm text-mute">Loading...</div></div>;
  }

  if (!project || !project.building) {
    return (
      <div className="card p-6 space-y-3">
        <h1 className="text-2xl font-semibold">Model evaluation</h1>
        <p className="text-mute text-sm">
          Set up your project context first on the{" "}
          <a href="/brief" className="text-accent hover:text-ink">Briefing</a>{" "}
          page.
        </p>
      </div>
    );
  }

  const pick = result?.recommendation;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Model evaluation</h1>
        <p className="text-mute text-sm mt-1">
          Compare AI models for your project, or have the AI suggest models that
          fit. Then run a real benchmark on any single model — with your own
          test prompts and scored outputs.
        </p>
      </div>

      <div className="card p-3 text-xs text-mute">
        Project: <span className="text-ink/80">{project.building}</span>
        {project.stack && <> · Stack: {project.stack}</>}
      </div>

      <ProviderStatusBar providers={providers} />

      <div className="card p-4 space-y-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-mute">
            Eval context (optional)
          </div>
          <div className="text-xs text-mute mt-1">
            Specific use case — e.g. &quot;summarize medical records, must be HIPAA-compliant&quot;.
          </div>
        </div>
        <textarea
          value={evalContext}
          onChange={(e) => setEvalContext(e.target.value)}
          rows={2}
          placeholder="(Optional) Scope the evaluation to a specific use case..."
          className="w-full bg-black/20 border border-edge rounded-lg p-3 text-sm outline-none focus:border-accent/60"
        />
      </div>

      <div className="card p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-mute">Models to compare</div>
            <div className="text-xs text-mute mt-1">
              Add up to 6 model names, or click <strong>Suggest for me</strong>.
            </div>
          </div>
          {modelNames.length > 0 && (
            <button onClick={() => setModelNames([])}
              className="text-[11px] text-mute hover:text-ink border border-edge rounded-full px-3 py-1">
              Clear all
            </button>
          )}
        </div>
        {modelNames.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {modelNames.map((m, i) => {
              const provider = detectProviderClient(m);
              const reachable = isProviderReachable(provider, providers);
              const providerLabel = PROVIDER_LABEL[provider] || provider;
              return (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1.5 text-xs border rounded-full px-3 py-1 ${
                    reachable === false
                      ? "bg-red-500/10 border-red-500/40 text-red-300"
                      : "bg-black/20 border-edge text-ink/90"
                  }`}
                  title={
                    reachable === false
                      ? `No key configured for ${providerLabel}. Benchmark on this model will error per prompt.`
                      : `Routes to ${providerLabel}`
                  }
                >
                  <code className="text-[12px]">{m}</code>
                  <span className="text-[10px] text-mute">
                    via {providerLabel}{reachable === false ? " ✗" : ""}
                  </span>
                  <button onClick={() => removeModel(i)} className="text-mute hover:text-ink" aria-label="Remove">✕</button>
                </span>
              );
            })}
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); addModel(); }} className="flex gap-2">
          <input value={modelInput} onChange={(e) => setModelInput(e.target.value)}
            placeholder="Type a model name and press Enter..."
            className="flex-1 bg-black/20 border border-edge rounded-lg p-2.5 text-sm outline-none focus:border-accent/60 font-mono" />
          <button type="submit" disabled={!modelInput.trim() || modelNames.length >= 6}
            className="btn btn-ghost text-sm disabled:opacity-50 disabled:cursor-not-allowed">Add</button>
        </form>
        <div className="flex gap-2 flex-wrap pt-1">
          <button onClick={() => run({ suggest: false })}
            disabled={loading || modelNames.length === 0}
            className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? "Comparing..." : "Compare these"}
          </button>
          <button onClick={() => run({ suggest: true })} disabled={loading}
            className="btn btn-ghost disabled:opacity-50">
            {loading ? "Thinking..." : "Suggest for me"}
          </button>
        </div>
      </div>

      {error && (
        <div className="card p-3 border-red-500/40 text-red-300 text-sm">{error}</div>
      )}

      {result && (
        <section className="space-y-4">
          {result.summary && (
            <div className="card p-5">
              <div className="text-[11px] uppercase tracking-wider text-mute">Summary</div>
              <p className="text-sm leading-relaxed mt-2 text-ink/90">{result.summary}</p>
              {result.recommendation && (
                <div className="mt-3 text-xs text-mute">
                  AI&apos;s pick: <code className="text-accent2">{result.recommendation}</code>
                </div>
              )}
            </div>
          )}
          <div className="grid lg:grid-cols-2 gap-4">
            {result.models.map((m, i) => (
              <ModelCard
                key={i}
                model={m}
                isPick={!!pick && (m.name === pick || m.displayName === pick)}
                project={project}
                evalContext={evalContext}
              />
            ))}
          </div>
        </section>
      )}

      {!result && !loading && (
        <div className="card p-6 text-center text-sm text-mute">
          Add some models and click <strong>Compare these</strong>, or click{" "}
          <strong>Suggest for me</strong> to let the AI propose 3-4 models. Each
          model card has a <strong>Run real benchmark</strong> button if you want
          to test it on actual prompts.
        </div>
      )}
    </div>
  );
}
