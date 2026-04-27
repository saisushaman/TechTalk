"use client";

import { useEffect, useState } from "react";
import {
  getProject,
  getBriefContext,
  getDayBrief,
  setDayBrief,
  todayKey,
  getRecentDays,
} from "@/lib/journal";
import ProjectContextForm from "@/components/ProjectContextForm";
import FeedbackButtons from "@/components/FeedbackButtons";

const STAGE_LABELS = {
  idea: "Idea / exploring",
  prototype: "Prototype",
  mvp: "MVP",
  shipping: "Shipping to users",
  scaling: "Scaling",
};

function formatDate(dateKey) {
  try {
    const [y, m, d] = dateKey.split("-").map(Number);
    const then = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((today - then) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return then.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  } catch { return dateKey; }
}

function relativeTime(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diffMin = Math.round((Date.now() - t) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

const VERDICT_STYLES = {
  "strong fit": { bg: "rgba(62,207,142,0.18)", fg: "#3ecf8e", border: "#2a8e65", label: "Strong fit" },
  "worth exploring": { bg: "rgba(124,92,255,0.18)", fg: "#a191ff", border: "#5a3dff", label: "Worth exploring" },
  "not right now": { bg: "rgba(200,90,90,0.15)", fg: "#e08a8a", border: "#7a3b3b", label: "Not right now" },
  "future interest": { bg: "rgba(180,180,180,0.12)", fg: "#b7bec9", border: "#3a404a", label: "Future interest" },
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

function SourceTag({ source }) {
  return (
    <span className="text-[11px] text-mute bg-black/30 border border-edge rounded px-2 py-0.5">
      {source}
    </span>
  );
}

function BriefItem({ item, indexForStagger = 0 }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50 + indexForStagger * 60);
    return () => clearTimeout(t);
  }, [indexForStagger]);

  return (
    <article className="card p-5 space-y-4 transition-all duration-300"
      style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(8px)" }}>
      <header>
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <SourceTag source={item.source} />
          {typeof item.score === "number" && item.score > 0 && (
            <span className="text-[11px] text-mute">{item.score} points</span>
          )}
          {item.publishedAt && (
            <span className="text-[11px] text-mute">· {relativeTime(item.publishedAt)}</span>
          )}
        </div>
        <a href={item.url} target="_blank" rel="noopener noreferrer"
          className="text-lg font-semibold leading-tight hover:text-accent">
          {item.title}
        </a>
      </header>
      {item.whatItIs && (
        <section>
          <div className="text-[11px] uppercase tracking-wider text-mute">What it is</div>
          <p className="text-sm leading-relaxed mt-1 text-ink/90">{item.whatItIs}</p>
        </section>
      )}
      {item.fitReasoning && (
        <section>
          <div className="text-[11px] uppercase tracking-wider text-mute flex items-center gap-2">
            <span>Fit for you</span>
            <VerdictBadge verdict={item.verdict} />
          </div>
          <p className="text-sm leading-relaxed mt-2 text-ink/90 whitespace-pre-line">{item.fitReasoning}</p>
        </section>
      )}
      {Array.isArray(item.related) && item.related.length > 0 && (
        <section>
          <div className="text-[11px] uppercase tracking-wider text-mute">Related in your journal</div>
          <ul className="mt-2 space-y-1">
            {item.related.map((r, i) => (
              <li key={i} className="text-xs text-mute bg-black/20 border border-edge rounded px-2 py-1 leading-relaxed">
                <span className="text-ink/80">[{r.date}]</span>{" "}
                <span className="text-accent">{r.type}</span>: {r.text}
              </li>
            ))}
          </ul>
        </section>
      )}
      {item.tryIt && (
        <section>
          <div className="text-[11px] uppercase tracking-wider text-mute">Try it</div>
          <div className="text-sm leading-relaxed mt-2 text-ink/90 bg-black/30 border border-edge rounded-lg p-3 whitespace-pre-line font-mono text-[13px]">
            {item.tryIt}
          </div>
        </section>
      )}
      <footer className="flex items-center justify-between gap-3 flex-wrap">
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:text-ink">
          Open source -&gt;
        </a>
        <FeedbackButtons surface="brief" subject={item.title} />
      </footer>
    </article>
  );
}

function DroppedList({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1.5">
      {items.map((d, i) => (
        <li key={i} className="text-xs bg-black/20 border border-edge rounded p-2">
          <span className="text-ink/70">[{d.source}]</span> {d.title}
          {d.reason && <span className="text-mute"> — {d.reason}</span>}
        </li>
      ))}
    </ul>
  );
}

// --- Suggested models sidebar widget ---
function ModelSuggestions({ project }) {
  const [models, setModels] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recommendation, setRecommendation] = useState(null);
  const [summary, setSummary] = useState("");

  async function fetchSuggestions() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/eval/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project, modelNames: [] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Suggest failed");
      setModels(data.models || []);
      setSummary(data.summary || "");
      setRecommendation(data.recommendation || null);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-mute">
            Models that suit your project
          </div>
          <div className="text-xs text-mute mt-1">
            AI-suggested models picked for what you&apos;re building. Open any
            in <a href="/eval" className="text-accent hover:text-ink">/eval</a> to compare deeper.
          </div>
        </div>
        <button onClick={fetchSuggestions} disabled={loading}
          className="text-xs btn btn-ghost disabled:opacity-50">
          {loading ? "Thinking..." : models ? "Refresh" : "Suggest"}
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-300">{error}</div>
      )}

      {!models && !loading && !error && (
        <div className="text-xs text-mute italic">
          Click <strong>Suggest</strong> to get 3-4 models that fit your project.
        </div>
      )}

      {models && models.length > 0 && (
        <>
          {summary && (
            <div className="text-xs text-ink/80 leading-relaxed bg-black/20 border border-edge rounded p-2">
              {summary}
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-2">
            {models.map((m, i) => {
              const isPick = recommendation && (m.name === recommendation || m.displayName === recommendation);
              return (
                <div key={i}
                  className={`bg-black/20 border rounded-lg p-3 text-xs space-y-2 ${
                    isPick ? "border-accent2/50" : "border-edge"
                  }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-mute">
                        {m.provider}
                        {isPick && <span className="ml-1 text-accent2">★</span>}
                      </div>
                      <div className="font-semibold text-sm text-ink/90">{m.displayName}</div>
                      <code className="text-[10px] text-mute">{m.name}</code>
                    </div>
                    <VerdictBadge verdict={m.fitVerdict} />
                  </div>
                  {m.fitReasoning && (
                    <p className="text-[11px] text-ink/80 leading-relaxed line-clamp-4">
                      {m.fitReasoning}
                    </p>
                  )}
                  <a
                    href={`/eval?model=${encodeURIComponent(m.name)}`}
                    className="text-[11px] text-accent hover:text-ink"
                  >
                    Compare in /eval -&gt;
                  </a>
                </div>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
}

export default function BriefPage() {
  const [project, setProjectState] = useState(undefined);
  const [editingContext, setEditingContext] = useState(false);
  const [brief, setBrief] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");
  const [previous, setPrevious] = useState([]);
  const [relativeTick, setRelativeTick] = useState(0);
  const [focusMessages, setFocusMessages] = useState([]);
  const [focusInput, setFocusInput] = useState("");

  useEffect(() => {
    const p = getProject();
    setProjectState(p);
    const todaysBrief = getDayBrief(todayKey());
    if (todaysBrief) setBrief(todaysBrief);
    const recent = getRecentDays(7).filter((d) => d.date !== todayKey() && d.brief);
    setPrevious(recent);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setRelativeTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  async function refresh() {
    if (fetching) return;
    setFetching(true);
    setError("");
    try {
      const ctx = getBriefContext();
      const res = await fetch("/api/brief/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...ctx, focusMessages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fetch failed");
      const today = todayKey();
      const saved = {
        items: data.items || [],
        sources: data.sources || [],
        fetchedAt: data.fetchedAt,
        note: data.note || null,
        personalizationUsed: data.personalizationUsed || null,
        droppedItems: data.droppedItems || [],
        droppedCount: data.droppedCount || 0,
      };
      setDayBrief(today, saved);
      setBrief({ ...saved });
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setFetching(false);
    }
  }

  function addFocus() {
    const text = focusInput.trim();
    if (!text) return;
    setFocusMessages((prev) => [...prev, text].slice(-6));
    setFocusInput("");
  }

  if (project === undefined) {
    return <div className="card p-5 opacity-60"><div className="text-sm text-mute">Loading...</div></div>;
  }

  if (!project || !project.building) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Briefing</h1>
          <p className="text-mute text-sm mt-1">
            A daily personalized digest. First, tell us about the project.
          </p>
        </div>
        <ProjectContextForm onSaved={(saved) => setProjectState(saved)} />
      </div>
    );
  }

  if (editingContext) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Edit project context</h1>
        <ProjectContextForm
          initial={project}
          onCancel={() => setEditingContext(false)}
          onSaved={(saved) => { setProjectState(saved); setEditingContext(false); }}
        />
      </div>
    );
  }

  const hasItems = brief?.items?.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <h1 className="text-2xl font-semibold">Briefing</h1>
          <p className="text-mute text-sm mt-1">
            New models, agents, and approaches - filtered for your project.
          </p>
        </div>
        <button onClick={refresh} disabled={fetching}
          className="btn btn-ghost disabled:opacity-50">
          {fetching ? "Fetching..." : hasItems ? "Refresh" : "Fetch today's brief"}
        </button>
      </div>

      <div className="card p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-[260px] space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-mute">For this project</div>
            <div className="text-sm text-ink/90">{project.building}</div>
            <div className="text-xs text-mute">
              {project.stack && <>Stack: {project.stack} · </>}
              Stage: {STAGE_LABELS[project.stage] || project.stage}
            </div>
            {project.preferences && (
              <div className="text-xs text-mute mt-1">
                Preferences: <span className="text-ink/70">{project.preferences}</span>
              </div>
            )}
          </div>
          <button onClick={() => setEditingContext(true)}
            className="text-xs text-mute hover:text-ink border border-edge rounded-full px-3 py-1">
            Edit context
          </button>
        </div>
      </div>

      {/* Suggested models for the project */}
      <ModelSuggestions project={project} />

      {/* Session-only focus chat */}
      <div className="card p-4 space-y-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-mute">
              Focus today (session only)
            </div>
            <div className="text-xs text-mute mt-1">
              Type free-text steering. Cleared on reload.
            </div>
          </div>
          {focusMessages.length > 0 && (
            <button onClick={() => setFocusMessages([])}
              className="text-[11px] text-mute hover:text-ink border border-edge rounded-full px-3 py-1">
              Clear all
            </button>
          )}
        </div>

        {focusMessages.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {focusMessages.map((m, i) => (
              <span key={i}
                className="inline-flex items-center gap-1.5 text-xs bg-accent/15 border border-accent/40 text-ink/90 rounded-full px-3 py-1">
                <span>{m}</span>
                <button onClick={() => setFocusMessages((prev) => prev.filter((_, j) => j !== i))}
                  className="text-mute hover:text-ink" aria-label="Remove focus">
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); addFocus(); }} className="flex gap-2">
          <input value={focusInput} onChange={(e) => setFocusInput(e.target.value)}
            placeholder='e.g. "today only show me HIPAA-compliant model news"'
            className="flex-1 bg-black/20 border border-edge rounded-lg p-2.5 text-sm outline-none focus:border-accent/60" />
          <button type="submit" disabled={!focusInput.trim() || focusMessages.length >= 6}
            className="btn btn-ghost text-sm disabled:opacity-50 disabled:cursor-not-allowed">
            Add focus
          </button>
        </form>
        {focusMessages.length > 0 && (
          <div className="text-[11px] text-mute">
            Hit <strong className="text-ink/80">Refresh</strong> to apply.
          </div>
        )}
      </div>

      {error && (
        <div className="card p-3 border-red-500/40 text-red-300 text-sm">{error}</div>
      )}

      {!brief && !fetching && (
        <div className="card p-6 text-center space-y-3">
          <div className="text-sm text-mute">
            Nothing fetched yet today.
          </div>
          <button onClick={refresh} className="btn btn-primary">
            Fetch today&apos;s brief
          </button>
        </div>
      )}

      {fetching && (
        <div className="card p-6 text-center text-sm text-mute">
          Reading the feeds, filtering for project relevance, reasoning about fit...
        </div>
      )}

      {hasItems && (
        <section>
          <div className="flex items-center justify-between mb-3 text-xs text-mute flex-wrap gap-2">
            <div className="uppercase tracking-wider">{formatDate(todayKey())}</div>
            <div className="flex items-center gap-2 flex-wrap">
              {brief.personalizationUsed && (
                <span title="What context shaped this brief">
                  {brief.personalizationUsed.focusActive > 0 ? `${brief.personalizationUsed.focusActive} focus · ` : ""}
                  {brief.personalizationUsed.preferencesPresent ? "prefs on · " : ""}
                  {brief.personalizationUsed.feedbackCount > 0 ? `${brief.personalizationUsed.feedbackCount} feedback · ` : ""}
                  {brief.personalizationUsed.searchPoolSize} journal snippets
                </span>
              )}
              {brief.fetchedAt && (
                <span title={new Date(brief.fetchedAt).toLocaleString()} key={relativeTick}>
                  · updated {relativeTime(brief.fetchedAt)}
                </span>
              )}
            </div>
          </div>
          {brief.note && (
            <div className="text-xs text-mute italic mb-3">{brief.note}</div>
          )}
          <div className="space-y-4">
            {brief.items.map((item, i) => (
              <BriefItem key={i} item={item} indexForStagger={i} />
            ))}
          </div>
          {brief.droppedCount > 0 && (
            <details className="mt-4 card p-3 text-xs text-mute">
              <summary className="cursor-pointer hover:text-ink">
                {brief.droppedCount} item{brief.droppedCount === 1 ? "" : "s"} filtered out — show why
              </summary>
              <DroppedList items={brief.droppedItems} />
            </details>
          )}
        </section>
      )}

      {brief && !hasItems && !fetching && (
        <div className="card p-5 text-sm text-mute text-center space-y-3">
          <div>{brief.note || "No items this round."}</div>
          {brief.droppedCount > 0 && (
            <details className="text-left text-xs">
              <summary className="cursor-pointer hover:text-ink">
                {brief.droppedCount} filtered out — show why
              </summary>
              <DroppedList items={brief.droppedItems} />
            </details>
          )}
        </div>
      )}

      {previous.length > 0 && (
        <section className="pt-2">
          <div className="text-xs uppercase tracking-wider text-mute mb-3">Previous briefings</div>
          <div className="space-y-3">
            {previous.map((day) => (
              <details key={day.date} className="card p-4 text-sm">
                <summary className="cursor-pointer text-ink/90 flex items-center gap-2">
                  <span>{formatDate(day.date)}</span>
                  <span className="text-mute">· {day.brief.items?.length || 0} items</span>
                </summary>
                <div className="mt-4 space-y-4">
                  {(day.brief.items || []).map((item, i) => (
                    <BriefItem key={i} item={item} indexForStagger={0} />
                  ))}
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
