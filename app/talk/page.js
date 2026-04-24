"use client";

import { useEffect, useRef, useState } from "react";
import { addTalkSession, getLatestTopics } from "@/lib/journal";

export default function TalkPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recentTopics, setRecentTopics] = useState([]);
  const [hasStarted, setHasStarted] = useState(false);
  const scrollerRef = useRef(null);
  const sessionStartRef = useRef(null);
  const seededFromRef = useRef([]);

  useEffect(() => {
    try {
      const latest = getLatestTopics({ maxDays: 3, max: 8 });
      setRecentTopics(latest);
    } catch {
      // journal reads are best-effort
    }
  }, []);

  useEffect(() => {
    function save() {
      if (messages.length < 2) return;
      try {
        addTalkSession({
          startedAt: sessionStartRef.current || new Date().toISOString(),
          seededFrom: seededFromRef.current,
          messages,
        });
      } catch {}
    }
    const onHide = () => {
      if (document.visibilityState === "hidden") save();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", save);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", save);
    };
  }, [messages]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/talk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setMessages([...next, { role: "assistant", content: data.reply }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function changeTopic({ useRecentTopics = false } = {}) {
    setLoading(true);
    setError("");
    sessionStartRef.current = new Date().toISOString();
    const seededTopics =
      useRecentTopics && recentTopics.length > 0
        ? recentTopics.map((t) => t.topic)
        : [];
    seededFromRef.current = seededTopics;

    try {
      const res = await fetch("/api/talk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [],
          changeTopic: true,
          seededTopics,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setMessages([{ role: "assistant", content: data.reply }]);
      setHasStarted(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (!hasStarted) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Tech Talk</h1>
          <p className="text-mute text-sm mt-1">
            A casual back-and-forth with a senior dev. Pick how you want to
            start.
          </p>
        </div>

        {recentTopics.length > 0 && (
          <div className="card p-5 space-y-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-mute">
                From your recent journal
              </div>
              <div className="mt-2 text-sm">
                We will pick one of these and kick off a conversation about it.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {recentTopics.map((t, i) => (
                <span
                  key={i}
                  className="text-xs text-mute bg-black/20 border border-edge rounded-full px-3 py-1"
                >
                  {t.topic}
                </span>
              ))}
            </div>
            <button
              onClick={() => changeTopic({ useRecentTopics: true })}
              disabled={loading}
              className="btn btn-primary w-full"
            >
              {loading ? "Starting..." : "Start talk on a recent topic"}
            </button>
          </div>
        )}

        <div className="card p-5 space-y-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-mute">
              Or go random
            </div>
            <div className="mt-2 text-sm">
              Pick a random tech-industry hot take to kick things off.
            </div>
          </div>
          <button
            onClick={() => changeTopic({ useRecentTopics: false })}
            disabled={loading}
            className="btn btn-ghost w-full"
          >
            {loading ? "Starting..." : "Random starter"}
          </button>
        </div>

        {error && (
          <div className="card p-3 border-red-500/40 text-red-300 text-sm">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tech Talk</h1>
          <p className="text-mute text-sm mt-1">
            {seededFromRef.current.length > 0
              ? "Seeded from your recent journal."
              : "A casual back-and-forth with a senior dev."}
          </p>
        </div>
        <button
          onClick={() => changeTopic({ useRecentTopics: false })}
          className="btn btn-ghost"
        >
          Change topic
        </button>
      </div>

      <div
        ref={scrollerRef}
        className="card p-4 h-[60vh] overflow-y-auto space-y-3"
      >
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`${
                m.role === "user" ? "chat-bubble-user" : "chat-bubble-ai"
              } max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="chat-bubble-ai rounded-2xl px-4 py-3 text-sm text-mute">
              <span className="inline-block animate-pulse">typing...</span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="card p-3 border-red-500/40 text-red-300 text-sm">
          {error}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="card p-2 flex items-end gap-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Say something back..."
          rows={1}
          className="flex-1 bg-transparent outline-none resize-none p-2 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </form>
      <p className="text-xs text-mute text-center">
        Tip: press Enter to send, Shift+Enter for a newline.
      </p>
    </div>
  );
}
