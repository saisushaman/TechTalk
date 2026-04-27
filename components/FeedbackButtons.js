"use client";

import { useState } from "react";
import { addFeedback } from "@/lib/journal";

/**
 * Small 👍 / 👎 component. On click, records to the journal and locks in.
 * Pass `surface` ("brief" | "lost" | "talk" | "listen") and `subject` (short label).
 */
export default function FeedbackButtons({ surface, subject, className = "" }) {
  const [vote, setVote] = useState(null);

  function cast(v) {
    if (vote !== null) return;
    try {
      addFeedback({ surface, subject, vote: v });
    } catch {
      // journal writes are best-effort
    }
    setVote(v);
  }

  return (
    <div className={`flex items-center gap-1.5 text-xs ${className}`}>
      <span className="text-mute">Useful?</span>
      <button
        type="button"
        onClick={() => cast(1)}
        disabled={vote !== null}
        className={`px-2 py-0.5 rounded border transition ${
          vote === 1
            ? "bg-accent2/20 border-accent2/50 text-accent2"
            : "border-edge text-mute hover:text-ink"
        } disabled:cursor-default`}
        aria-label="Useful"
        title="Mark as useful"
      >
        👍
      </button>
      <button
        type="button"
        onClick={() => cast(-1)}
        disabled={vote !== null}
        className={`px-2 py-0.5 rounded border transition ${
          vote === -1
            ? "bg-red-500/20 border-red-500/40 text-red-300"
            : "border-edge text-mute hover:text-ink"
        } disabled:cursor-default`}
        aria-label="Not useful"
        title="Not useful"
      >
        👎
      </button>
      {vote !== null && (
        <span className="text-mute ml-1">
          {vote === 1 ? "noted" : "we'll avoid this"}
        </span>
      )}
    </div>
  );
}
