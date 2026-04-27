"use client";

import { useState } from "react";
import { setProject } from "@/lib/journal";

const STAGES = [
  { key: "idea", label: "Idea / exploring" },
  { key: "prototype", label: "Prototype" },
  { key: "mvp", label: "MVP" },
  { key: "shipping", label: "Shipping to users" },
  { key: "scaling", label: "Scaling" },
];

export default function ProjectContextForm({ initial, onSaved, onCancel }) {
  const [building, setBuilding] = useState(initial?.building || "");
  const [stack, setStack] = useState(initial?.stack || "");
  const [stage, setStage] = useState(initial?.stage || "prototype");
  const [curiosity, setCuriosity] = useState(initial?.curiosity || "");
  const [stuckOn, setStuckOn] = useState(initial?.stuckOn || "");
  const [preferences, setPreferences] = useState(initial?.preferences || "");
  const [saving, setSaving] = useState(false);

  function save(e) {
    e?.preventDefault();
    setSaving(true);
    try {
      const saved = setProject({
        building,
        stack,
        stage,
        curiosity,
        stuckOn,
        preferences,
      });
      onSaved?.(saved);
    } finally {
      setSaving(false);
    }
  }

  const filledEnough = building.trim().length > 5;

  return (
    <form onSubmit={save} className="card p-5 space-y-5">
      <div>
        <div className="text-xs uppercase tracking-wider text-mute">
          About your project
        </div>
        <div className="text-sm text-mute mt-1">
          This context goes into every daily briefing. More detail = sharper
          suggestions. You can edit any time.
        </div>
      </div>

      <div>
        <label className="text-xs text-mute block mb-1">
          What are you building?
        </label>
        <textarea
          value={building}
          onChange={(e) => setBuilding(e.target.value)}
          rows={3}
          placeholder="A web app that helps people keep up with tech conversations..."
          className="w-full bg-black/20 border border-edge rounded-lg p-3 text-sm outline-none focus:border-accent/60"
        />
      </div>

      <div>
        <label className="text-xs text-mute block mb-1">Current stack</label>
        <input
          value={stack}
          onChange={(e) => setStack(e.target.value)}
          placeholder="e.g. Next.js 14, Groq llama-3.3, localStorage"
          className="w-full bg-black/20 border border-edge rounded-lg p-3 text-sm outline-none focus:border-accent/60"
        />
      </div>

      <div>
        <label className="text-xs text-mute block mb-2">Stage</label>
        <div className="flex flex-wrap gap-2">
          {STAGES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setStage(s.key)}
              className={`text-xs px-3 py-1.5 rounded-full border ${
                stage === s.key
                  ? "bg-accent text-white border-accent"
                  : "bg-black/20 text-mute border-edge hover:text-ink"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs text-mute block mb-1">
          What are you actively curious about?
        </label>
        <textarea
          value={curiosity}
          onChange={(e) => setCuriosity(e.target.value)}
          rows={2}
          placeholder="voice mode, agent loops, memory systems, local inference..."
          className="w-full bg-black/20 border border-edge rounded-lg p-3 text-sm outline-none focus:border-accent/60"
        />
      </div>

      <div>
        <label className="text-xs text-mute block mb-1">
          What are you stuck on? <span className="text-mute">(optional)</span>
        </label>
        <textarea
          value={stuckOn}
          onChange={(e) => setStuckOn(e.target.value)}
          rows={2}
          placeholder="making the AI tone casual without being unhelpful..."
          className="w-full bg-black/20 border border-edge rounded-lg p-3 text-sm outline-none focus:border-accent/60"
        />
      </div>

      <div>
        <label className="text-xs text-mute block mb-1">
          Preferences for suggestions{" "}
          <span className="text-mute">(optional)</span>
        </label>
        <textarea
          value={preferences}
          onChange={(e) => setPreferences(e.target.value)}
          rows={3}
          placeholder={`e.g. "prefer actionable snippets over essays; skip vendor comparisons; deprioritize pure-research papers; I'm an open-source leaning person"`}
          className="w-full bg-black/20 border border-edge rounded-lg p-3 text-sm outline-none focus:border-accent/60"
        />
        <div className="text-[11px] text-mute mt-1">
          This is a free-form "more of X, less of Y" layer the AI will follow.
          Combined with your 👍/👎 feedback over time, it shapes every briefing
          and reply.
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn btn-ghost">
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={!filledEnough || saving}
          className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Save context"}
        </button>
      </div>
    </form>
  );
}
