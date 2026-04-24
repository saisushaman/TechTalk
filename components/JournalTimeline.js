"use client";

import { useEffect, useState } from "react";
import { getRecentDays } from "@/lib/journal";

function formatDay(dateKey) {
  try {
    const [y, m, d] = dateKey.split("-").map(Number);
    const then = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today - then) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7)
      return then.toLocaleDateString(undefined, { weekday: "long" });
    return then.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateKey;
  }
}

export default function JournalTimeline() {
  const [days, setDays] = useState(null); // null = loading, [] = empty

  useEffect(() => {
    setDays(getRecentDays(7));
  }, []);

  // SSR / not-yet-loaded: show a placeholder so layout doesn't jump
  if (days === null) {
    return (
      <div className="card p-5 opacity-60">
        <div className="text-xs uppercase tracking-wider text-mute">
          Your journal
        </div>
        <div className="mt-2 text-sm text-mute">Loading…</div>
      </div>
    );
  }

  const nonEmpty = days.filter(
    (d) =>
      (d.listen?.length || 0) +
        (d.talk?.length || 0) +
        (d.lost?.length || 0) >
      0,
  );

  if (nonEmpty.length === 0) {
    return (
      <div className="card p-5">
        <div className="text-xs uppercase tracking-wider text-mute">
          Your journal
        </div>
        <div className="mt-2 text-sm text-mute">
          Nothing recorded yet. Try a lookup in <strong>I&apos;m Lost</strong>,
          a session in <strong>Listen</strong>, or a chat in{" "}
          <strong>Tech Talk</strong> — entries show up here by date.
        </div>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-wider text-mute">
        Your journal
      </div>
      <div className="mt-4 space-y-3">
        {nonEmpty.map((d) => (
          <div
            key={d.date}
            className="bg-black/20 border border-edge rounded-xl p-3"
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">{formatDay(d.date)}</div>
              <div className="text-[11px] text-mute">{d.date}</div>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-mute">
              {d.listen?.length > 0 && (
                <span>🎧 {d.listen.length} listen</span>
              )}
              {d.talk?.length > 0 && <span>💬 {d.talk.length} talk</span>}
              {d.lost?.length > 0 && <span>🆘 {d.lost.length} lookup</span>}
            </div>
            {d.topics?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {d.topics.slice(0, 6).map((t, i) => (
                  <span
                    key={i}
                    className="text-[11px] text-ink/80 bg-black/30 border border-edge rounded-full px-2 py-0.5"
                  >
                    {t}
                  </span>
                ))}
                {d.topics.length > 6 && (
                  <span className="text-[11px] text-mute">
                    +{d.topics.length - 6} more
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
