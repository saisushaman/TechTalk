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
    <span
      className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border"
      style={{ background: s.bg, color: s.fg, borderColor: s.border }}
    >
      {s.label}
    </span>
  );
}

function ModelCard({ model, isPick }) {
  return (
    <article
      className={`card p-5 space-y-3 ${isPick ? "border-accent2/60" : ""}`}
      style={isPick ? { boxShadow: "0 0 0 1px rgba(62,207,142,0.4)" } : {}}
    >
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-mute">
            {model.provider}
            {isPick && (
              <span className="ml-2 text-accent2">★ AI&apos;s pick</span>
            )}
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
          <div className="text-mute text-[10px] uppercase tracking-wider">
            Context
          </div>
          <div className="mt-0.5 text-ink/90">{model.contextWindow}</div>
        </div>
        <div className="bg-black/20 border border-edge rounded p-2">
          <div className="text-mute text-[10px] uppercase tracking-wider">
            Pricing
          </div>
          <div className="mt-0.5 text-ink/90">{model.approxPrice}</div>
        </div>
        <div className="bg-black/20 border border-edge rounded p-2">
          <div className="text-mute text-[10px] uppercase tracking-wider">
            License
          </div>
          <div className="mt-0.5 text-ink/90">{model.license}</div>
        </div>
        <div className="bg-black/20 border border-edge rounded p-2">
          <div className="text-mute text-[10px] uppercase tracking-wider">
            HIPAA / BAA
          </div>
          <div className="mt-0.5 text-ink/90">{model.hipaaBaa}</div>
        </div>
      </div>

      {(model.strengths?.length > 0 || model.weaknesses?.length > 0) && (
        <div className="grid sm:grid-cols-2 gap-3">
          {model.strengths?.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-accent2 mb-1">
                Strengths
              </div>
              <ul className="text-xs text-ink/90 space-y-0.5">
                {model.strengths.map((s, i) => (
                  <li key={i}>+ {s}</li>
                ))}
              </ul>
            </div>
          )}
          {model.weaknesses?.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-red-300 mb-1">
                Weaknesses
              </div>
              <ul className="text-xs text-ink/90 space-y-0.5">
                {model.weaknesses.map((s, i) => (
                  <li key={i}>− {s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {model.bestFor?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {model.bestFor.map((b, i) => (
            <span
              key={i}
              className="text-[10px] text-mute bg-black/30 border border-edge rounded-full px-2 py-0.5"
            >
              {b}
            </span>
          ))}
        </div>
      )}

      {model.fitReasoning && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-mute mb-1">
            Fit for your project
          </div>
          <p className="text-sm text-ink/90 leading-relaxed whitespace-pre-line">
            {model.fitReasoning}
          </p>
        </div>
      )}
    </article>
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

  useEffect(() => {
    const p = getProject();
    setProjectState(p);
    // Pre-load model from query string if briefing linked us here
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const m = params.get("model");
      if (m) setModelNames([m]);
      const ctx = params.get("ctx");
      if (ctx) setEvalContext(ctx);
    }
  }, []);

  function addModel() {
    const t = modelInput.trim();
    if (!t) return;
    if (modelNames.includes(t)) {
      setModelInput("");
      return;
    }
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
      // If suggest mode returned models, prefill the chips so user can edit + re-run
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
    return (
      <div className="card p-5 opacity-60">
        <div className="text-sm text-mute">Loading...</div>
      </div>
    );
  }

  if (!project || !project.building) {
    return (
      <div className="card p-6 space-y-3">
        <h1 className="text-2xl font-semibold">Model evaluation</h1>
        <p className="text-mute text-sm">
          Set up your project context first on the{" "}
          <a href="/brief" className="text-accent hover:text-ink">
            Briefing
          </a>{" "}
          page. The eval is much sharper when it knows what you&apos;re
          building.
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
          Compare AI models for your project, or ask the AI to suggest models
          that fit. Project context flows in automatically; add an eval-context
          below if you want to scope to a specific use case.
        </p>
      </div>

      {/* Project context summary (read-only here) */}
      <div className="card p-3 text-xs text-mute">
        Project: <span className="text-ink/80">{project.building}</span>
        {project.stack && <> · Stack: {project.stack}</>}
      </div>

      {/* Eval context */}
      <div className="card p-4 space-y-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-mute">
            Eval context (optional)
          </div>
          <div className="text-xs text-mute mt-1">
            Specific use case you want the model for — e.g.{" "}
            &quot;summarize medical records, must be HIPAA-compliant&quot; or
            &quot;fast tool-use for a chat agent&quot;.
          </div>
        </div>
        <textarea
          value={evalContext}
          onChange={(e) => setEvalContext(e.target.value)}
          rows={2}
          placeholder="(Optional) Scope this evaluation to a specific use case..."
          className="w-full bg-black/20 border border-edge rounded-lg p-3 text-sm outline-none focus:border-accent/60"
        />
      </div>

      {/* Model input */}
      <div className="card p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-mute">
              Models to compare
            </div>
            <div className="text-xs text-mute mt-1">
              Add up to 6 model names (e.g. <code>claude-haiku-4-5</code>,{" "}
              <code>gpt-4o-mini</code>, <code>llama-3.3-70b</code>,{" "}
              <code>gemini-2.5-flash</code>). Or skip this and click{" "}
              <strong className="text-ink/80">Suggest for me</strong>.
            </div>
          </div>
          {modelNames.length > 0 && (
            <button
              onClick={() => setModelNames([])}
              className="text-[11px] text-mute hover:text-ink border border-edge rounded-full px-3 py-1"
            >
              Clear all
            </button>
          )}
        </div>

        {modelNames.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {modelNames.map((m, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 text-xs bg-black/20 border border-edge text-ink/90 rounded-full px-3 py-1"
              >
                <code className="text-[12px]">{m}</code>
                <button
                  onClick={() => removeModel(i)}
                  className="text-mute hover:text-ink"
                  aria-label="Remove"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            addModel();
          }}
          className="flex gap-2"
        >
          <input
            value={modelInput}
            onChange={(e) => setModelInput(e.target.value)}
            placeholder="Type a model name and press Enter..."
            className="flex-1 bg-black/20 border border-edge rounded-lg p-2.5 text-sm outline-none focus:border-accent/60 font-mono"
          />
          <button
            type="submit"
            disabled={!modelInput.trim() || modelNames.length >= 6}
            className="btn btn-ghost text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </form>

        <div className="flex gap-2 flex-wrap pt-1">
          <button
            onClick={() => run({ suggest: false })}
            disabled={loading || modelNames.length === 0}
            className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Comparing..." : "Compare these"}
          </button>
          <button
            onClick={() => run({ suggest: true })}
            disabled={loading}
            className="btn btn-ghost disabled:opacity-50"
          >
            {loading ? "Thinking..." : "Suggest for me"}
          </button>
        </div>
      </div>

      {error && (
        <div className="card p-3 border-red-500/40 text-red-300 text-sm">
          {error}
        </div>
      )}

      {result && (
        <section className="space-y-4">
          {result.summary && (
            <div className="card p-5">
              <div className="text-[11px] uppercase tracking-wider text-mute">
                Summary
              </div>
              <p className="text-sm leading-relaxed mt-2 text-ink/90">
                {result.summary}
              </p>
              {result.recommendation && (
                <div className="mt-3 text-xs text-mute">
                  AI&apos;s pick:{" "}
                  <code className="text-accent2">{result.recommendation}</code>
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
              />
            ))}
          </div>
        </section>
      )}

      {!result && !loading && (
        <div className="card p-6 text-center text-sm text-mute">
          Add some models and click <strong>Compare these</strong>, or click{" "}
          <strong>Suggest for me</strong> to let the AI propose 3-4 models that
          fit your project.
        </div>
      )}
    </div>
  );
}
