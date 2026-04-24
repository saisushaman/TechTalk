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
    return then.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateKey;
  }
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
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

function VerdictBadge({ verdict }) {
  const styles = {
    "strong fit": {
      bg: "rgba(62,207,142,0.18)",
      fg: "#3ecf8e",
      border: "#2a8e65",
      label: "Strong fit",
    },
    "worth exploring": {
      bg: "rgba(124,92,255,0.18)",
      fg: "#a191ff",
      border: "#5a3dff",
      label: "Worth exploring",
    },
    "not right now": {
      bg: "rgba(200,90,90,0.15)",
      fg: "#e08a8a",
      border: "#7a3b3b",
      label: "Not right now",
    },
    "future interest": {
      bg: "rgba(180,180,180,0.12)",
      fg: "#b7bec9",
      border: "#3a404a",
      label: "Future interest",
    },
  };
  const s = styles[verdict] || styles["worth exploring"];
  return (
    <span
      className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border"
      style={{ background: s.bg, color: s.fg, borderColor: s.border }}
    >
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
    <article
      className="card p-5 space-y-4 transition-all duration-300"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
      }}
    >
      <header>
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <SourceTag source={item.source} />
          {typeof item.score === "number" && item.score > 0 && (
            <span className="text-[11px] text-mute">{item.score} points</span>
          )}
          {item.publishedAt && (
            <span className="text-[11px] text-mute">
              · {relativeTime(item.publishedAt)}
            </span>
          )}
        </div>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-lg font-semibold leading-tight hover:text-accent"
        >
          {item.title}
        </a>
      </header>

      {item.whatItIs && (
        <section>
          <div className="text-[11px] uppercase tracking-wider text-mute">
            What it is
          </div>
          <p className="text-sm leading-relaxed mt-1 text-ink/90">
            {item.whatItIs}
          </p>
        </section>
      )}

      {item.fitReasoning && (
        <section>
          <div className="text-[11px] uppercase tracking-wider text-mute flex items-center gap-2">
            <span>Fit for you</span>
            <VerdictBadge verdict={item.verdict} />
          </div>
          <p className="text-sm leading-relaxed mt-2 text-ink/90 whitespace-pre-line">
            {item.fitReasoning}
          </p>
        </section>
      )}

      {item.tryIt && (
        <section>
          <div className="text-[11px] uppercase tracking-wider text-mute">
            Try it
          </div>
          <div className="text-sm leading-relaxed mt-2 text-ink/90 bg-black/30 border border-edge rounded-lg p-3 whitespace-pre-line font-mono text-[13px]">
            {item.tryIt}
          </div>
        </section>
      )}

      <footer>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-accent hover:text-ink"
        >
          Open source -&gt;
        </a>
      </footer>
    </article>
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

  useEffect(() => {
    const p = getProject();
    setProjectState(p);
    const todaysBrief = getDayBrief(todayKey());
    if (todaysBrief) setBrief(todaysBrief);
    const recent = getRecentDays(7).filter(
      (d) => d.date !== todayKey() && d.brief,
    );
    setPrevious(recent);
  }, []);

  // Tick every 60s so "N min ago" labels update live.
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
        body: JSON.stringify(ctx),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fetch failed");
      const today = todayKey();
      const saved = {
        items: data.items || [],
        sources: data.sources || [],
        fetchedAt: data.fetchedAt,
        note: data.note || null,
      };
      setDayBrief(today, saved);
      setBrief({ ...saved });
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setFetching(false);
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
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Briefing</h1>
          <p className="text-mute text-sm mt-1">
            A daily personalized digest of new models, agents, and approaches -
            reasoned for what you&apos;re actually building. First, tell us a
            little about the project.
          </p>
        </div>
        <ProjectContextForm
          onSaved={(saved) => {
            setProjectState(saved);
          }}
        />
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
          onSaved={(saved) => {
            setProjectState(saved);
            setEditingContext(false);
          }}
        />
      </div>
    );
  }

  const hasItems = brief?.items?.length > 0;

  return (
    <div className="space-y-6">
      {/* Header + refresh */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <h1 className="text-2xl font-semibold">Briefing</h1>
          <p className="text-mute text-sm mt-1">
            New models, agents, and approaches - filtered and reasoned for
            what you&apos;re building.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={fetching}
          className="btn btn-ghost disabled:opacity-50"
        >
          {fetching ? "Fetching..." : hasItems ? "Refresh" : "Fetch today's brief"}
        </button>
      </div>

      {/* Context summary */}
      <div className="card p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-[260px] space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-mute">
              For this project
            </div>
            <div className="text-sm text-ink/90">{project.building}</div>
            <div className="text-xs text-mute">
              {project.stack && <>Stack: {project.stack} · </>}
              Stage: {STAGE_LABELS[project.stage] || project.stage}
            </div>
          </div>
          <button
            onClick={() => setEditingContext(true)}
            className="text-xs text-mute hover:text-ink border border-edge rounded-full px-3 py-1"
          >
            Edit context
          </button>
        </div>
      </div>

      {error && (
        <div className="card p-3 border-red-500/40 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!brief && !fetching && (
        <div className="card p-6 text-center space-y-3">
          <div className="text-sm text-mute">
            Nothing fetched yet today. Hit the button to pull from Hacker News,
            Anthropic, OpenAI, Hugging Face, DeepMind, and Simon Willison.
          </div>
          <button onClick={refresh} className="btn btn-primary">
            Fetch today&apos;s brief
          </button>
        </div>
      )}

      {/* Loading */}
      {fetching && (
        <div className="card p-6 text-center text-sm text-mute">
          Reading the feeds and reasoning about fit for your project...
          <div className="mt-2 text-[11px] text-mute">
            Usually takes 15-30 seconds. Pulling from 6 sources in parallel.
          </div>
        </div>
      )}

      {/* Today's brief */}
      {hasItems && (
        <section>
          <div className="flex items-center justify-between mb-3 text-xs text-mute">
            <div className="uppercase tracking-wider">
              {formatDate(todayKey())}
            </div>
            <div className="flex items-center gap-2">
              {brief.sources?.length > 0 && (
                <span className="hidden sm:inline">
                  {brief.sources.length} source
                  {brief.sources.length === 1 ? "" : "s"}
                </span>
              )}
              {brief.fetchedAt && (
                <span
                  title={new Date(brief.fetchedAt).toLocaleString()}
                  key={relativeTick}
                >
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
        </section>
      )}

      {/* Empty items returned */}
      {brief && !hasItems && !fetching && (
        <div className="card p-5 text-sm text-mute text-center">
          {brief.note ||
            "No items this round. Try again in a bit, or edit your project context to widen the net."}
        </div>
      )}

      {/* Previous briefings */}
      {previous.length > 0 && (
        <section className="pt-2">
          <div className="text-xs uppercase tracking-wider text-mute mb-3">
            Previous briefings
          </div>
          <div className="space-y-3">
            {previous.map((day) => (
              <details key={day.date} className="card p-4 text-sm">
                <summary className="cursor-pointer text-ink/90 flex items-center gap-2">
                  <span>{formatDate(day.date)}</span>
                  <span className="text-mute">
                    · {day.brief.items?.length || 0} items
                  </span>
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
