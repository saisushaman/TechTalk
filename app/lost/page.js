"use client";

import { useState } from "react";
import { addLostLookup } from "@/lib/journal";

const EXAMPLES = [
  "They were talking about MCP servers and I got lost",
  "Someone said 'this is just a wrapper around an LLM' as a bad thing",
  "My teammate mentioned vibe coding and everyone laughed",
  "The thread was about context windows vs RAG and I blanked",
];

export default function LostPage() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [deeper, setDeeper] = useState(null);
  const [deeperLoading, setDeeperLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedIdx, setCopiedIdx] = useState(null);

  async function explain() {
    if (!input.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setDeeper(null);
    try {
      const res = await fetch("/api/lost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: input.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setResult(data);
      try {
        addLostLookup({
          input: input.trim(),
          meaning: data.meaning,
          whyItMatters: data.whyItMatters,
          replies: data.replies,
        });
      } catch {
        // journal save is best-effort
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function goDeeper() {
    if (!result) return;
    setDeeperLoading(true);
    try {
      const res = await fetch("/api/lost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: input.trim(),
          mode: "deeper",
          previous: result,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setDeeper(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setDeeperLoading(false);
    }
  }

  function copy(text, idx) {
    navigator.clipboard?.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1200);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">I&apos;m Lost</h1>
        <p className="text-mute text-sm mt-1">
          Paste the moment. Get clarity + what to say back.
        </p>
      </div>

      <div className="card p-4 space-y-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. They were talking about MCP servers and I got lost"
          rows={3}
          className="w-full bg-transparent outline-none resize-none text-base placeholder:text-mute"
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") explain();
          }}
        />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setInput(ex)}
                className="text-xs text-mute hover:text-ink border border-edge rounded-full px-3 py-1"
              >
                {ex}
              </button>
            ))}
          </div>
          <button
            onClick={explain}
            disabled={loading || !input.trim()}
            className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Thinking..." : "Explain it"}
          </button>
        </div>
      </div>

      {error && (
        <div className="card p-4 border-red-500/40 text-red-300 text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="text-xs uppercase tracking-wider text-mute">
              Meaning
            </div>
            <p className="mt-2 leading-relaxed">{result.meaning}</p>
          </div>

          {result.whyItMatters && (
            <div className="card p-5">
              <div className="text-xs uppercase tracking-wider text-mute">
                Why it matters
              </div>
              <p className="mt-2 leading-relaxed">{result.whyItMatters}</p>
            </div>
          )}

          {result.replies?.length > 0 && (
            <div className="card p-5">
              <div className="text-xs uppercase tracking-wider text-mute">
                What you could say back
              </div>
              <ul className="mt-3 space-y-2">
                {result.replies.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-start justify-between gap-3 bg-black/20 border border-edge rounded-xl p-3"
                  >
                    <span className="text-sm leading-relaxed">&ldquo;{r}&rdquo;</span>
                    <button
                      onClick={() => copy(r, i)}
                      className="text-xs text-mute hover:text-ink shrink-0"
                    >
                      {copiedIdx === i ? "Copied" : "Copy"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!deeper && (
            <button
              onClick={goDeeper}
              disabled={deeperLoading}
              className="btn btn-ghost w-full"
            >
              {deeperLoading ? "Digging in..." : "Go Deeper"}
            </button>
          )}

          {deeper && (
            <div className="card p-5">
              <div className="text-xs uppercase tracking-wider text-mute">
                Deeper cut
              </div>
              <p className="mt-2 leading-relaxed whitespace-pre-line">
                {deeper.deeper}
              </p>
              {Array.isArray(deeper.terms) && deeper.terms.length > 0 && (
                <div className="mt-4 grid sm:grid-cols-2 gap-2">
                  {deeper.terms.map((t, i) => (
                    <div
                      key={i}
                      className="bg-black/20 border border-edge rounded-xl p-3"
                    >
                      <div className="text-sm font-semibold">{t.term}</div>
                      <div className="text-xs text-mute mt-1">
                        {t.oneLiner}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
