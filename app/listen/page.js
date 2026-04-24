"use client";

import { useEffect, useRef, useState } from "react";
import { addListenSession } from "@/lib/journal";

const DIGEST_INTERVAL_MS = 30000;

export default function ListenPage() {
  const [isListening, setIsListening] = useState(false);
  const [support, setSupport] = useState(null);
  const [error, setError] = useState("");
  const [captions, setCaptions] = useState("");
  const [notes, setNotes] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [savedMessage, setSavedMessage] = useState("");

  const recognitionRef = useRef(null);
  const pendingChunkRef = useRef("");
  const fullTranscriptRef = useRef("");
  const digestTimerRef = useRef(null);
  const shouldListenRef = useRef(false);
  const sessionStartRef = useRef(null);

  const notesRef = useRef([]);
  const questionsRef = useRef([]);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);
  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupport(!!SR);
  }, []);

  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
        recognitionRef.current = null;
      }
      if (digestTimerRef.current) {
        clearInterval(digestTimerRef.current);
        digestTimerRef.current = null;
      }
    };
  }, []);

  function dedupStrings(arr) {
    const seen = new Set();
    const out = [];
    for (const s of arr) {
      const k = (s || "").toLowerCase().trim();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }
    return out;
  }

  function newId() {
    return Math.random().toString(36).slice(2, 10);
  }

  function startRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    let interim = "";
    let consecutiveNetworkErrors = 0;

    rec.onresult = (e) => {
      consecutiveNetworkErrors = 0;
      let finalText = "";
      interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript + " ";
        else interim += r[0].transcript;
      }
      if (finalText) {
        pendingChunkRef.current += finalText;
        fullTranscriptRef.current += finalText;
      }
      setCaptions(
        fullTranscriptRef.current + (interim ? " " + interim : ""),
      );
    };

    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;

      if (e.error === "not-allowed") {
        setError(
          "Microphone permission was denied. Allow it in the browser's address bar, then try again.",
        );
        shouldListenRef.current = false;
        setIsListening(false);
        return;
      }

      if (e.error === "network") {
        consecutiveNetworkErrors++;
        console.warn("speech network error (#" + consecutiveNetworkErrors + ")");
        if (consecutiveNetworkErrors >= 3) {
          setError(
            "Browser speech recognition can't reach Google's servers. Check your connection, make sure you're on http://localhost:3000 (not 127.0.0.1 or a LAN IP), and disable any VPN or corporate proxy that might be blocking it.",
          );
        }
        return;
      }

      consecutiveNetworkErrors = 0;
      console.warn("speech error:", e.error);
      setError("Mic issue: " + e.error + " - trying to recover.");
    };

    rec.onend = () => {
      if (!shouldListenRef.current) return;
      setTimeout(() => {
        if (!shouldListenRef.current) return;
        try {
          rec.start();
        } catch {
          // will retry on next onend cycle
        }
      }, 400);
    };

    try {
      rec.start();
      recognitionRef.current = rec;
    } catch (e) {
      setError("Couldn't start the microphone: " + (e.message || String(e)));
      shouldListenRef.current = false;
      setIsListening(false);
    }
  }

  async function sendDigest() {
    const chunk = pendingChunkRef.current.trim();
    if (!chunk || chunk.length < 20) return;
    pendingChunkRef.current = "";

    try {
      const res = await fetch("/api/listen/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chunk,
          recentNotes: notesRef.current.slice(-6),
          recentQuestions: questionsRef.current.slice(0, 8).map((q) => q.text),
        }),
      });
      const data = await res.json();

      if (Array.isArray(data.notes) && data.notes.length) {
        setNotes((prev) => dedupStrings([...prev, ...data.notes]));
      }
      if (Array.isArray(data.questions) && data.questions.length) {
        setQuestions((prev) => {
          const existing = new Set(prev.map((q) => q.text.toLowerCase().trim()));
          const incoming = data.questions
            .filter((q) => q && !existing.has(q.toLowerCase().trim()))
            .map((q) => ({ id: newId(), text: q }));
          return [...incoming, ...prev].slice(0, 8);
        });
      }
    } catch (e) {
      console.warn("digest request failed:", e);
    }
  }

  function start() {
    setError("");
    setSavedMessage("");
    setCaptions("");
    setNotes([]);
    setQuestions([]);
    pendingChunkRef.current = "";
    fullTranscriptRef.current = "";
    sessionStartRef.current = new Date().toISOString();
    shouldListenRef.current = true;
    setIsListening(true);
    startRecognition();
    digestTimerRef.current = setInterval(sendDigest, DIGEST_INTERVAL_MS);
  }

  async function stop() {
    shouldListenRef.current = false;
    setIsListening(false);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    if (digestTimerRef.current) {
      clearInterval(digestTimerRef.current);
      digestTimerRef.current = null;
    }

    await sendDigest();

    try {
      const finalQuestions = questionsRef.current.map((q) => q.text);
      addListenSession({
        startedAt: sessionStartRef.current,
        transcript: fullTranscriptRef.current.trim(),
        notes: notesRef.current,
        topics: finalQuestions,
      });
      setSavedMessage("Session saved to today's journal.");
    } catch (e) {
      console.warn("journal save failed:", e);
    }
  }

  async function explainQuestion(q) {
    setQuestions((prev) =>
      prev.map((x) => (x.id === q.id ? { ...x, loading: true } : x)),
    );
    try {
      const res = await fetch("/api/listen/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q.text,
          context: fullTranscriptRef.current.slice(-2000),
        }),
      });
      const data = await res.json();
      setQuestions((prev) =>
        prev.map((x) =>
          x.id === q.id
            ? {
                ...x,
                loading: false,
                answer: data.answer || data.error || "No answer.",
              }
            : x,
        ),
      );
    } catch {
      setQuestions((prev) =>
        prev.map((x) =>
          x.id === q.id
            ? { ...x, loading: false, answer: "Couldn't fetch an answer." }
            : x,
        ),
      );
    }
  }

  if (support === false) {
    return (
      <div className="card p-6">
        <h1 className="text-2xl font-semibold">Listen mode</h1>
        <p className="mt-3 text-mute">
          Your browser doesn&apos;t support the Web Speech API used by Listen
          mode. Open ConvoTech in Chrome or Edge to use this feature.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Listen mode</h1>
          <p className="text-mute text-sm mt-1">
            ConvoTech listens, takes running notes, and surfaces questions you
            can tap for instant explanations.
          </p>
          <p className="text-xs text-mute mt-2">
            Only use with everyone&apos;s consent. The transcript is sent to
            the AI for analysis and saved locally on this device.
          </p>
        </div>
        {!isListening ? (
          <button onClick={start} className="btn btn-primary">
            Start listening
          </button>
        ) : (
          <button
            onClick={stop}
            className="btn"
            style={{ background: "#c2443c", color: "white", border: "1px solid #a33" }}
          >
            Stop
          </button>
        )}
      </div>

      {isListening && (
        <div className="flex items-center gap-2 text-xs text-accent2">
          <span className="inline-block w-2 h-2 rounded-full bg-accent2 animate-pulse" />
          Listening - first notes arrive after ~30 seconds of audio
        </div>
      )}
      {savedMessage && !isListening && (
        <div className="text-xs text-accent2">{savedMessage}</div>
      )}

      {error && (
        <div className="card p-3 border-red-500/40 text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <div className="card p-4 min-h-[300px] md:col-span-1">
          <div className="text-xs uppercase tracking-wider text-mute">
            Captions
          </div>
          <div className="mt-2 text-xs text-mute whitespace-pre-wrap max-h-[55vh] overflow-y-auto leading-relaxed">
            {captions || (
              <span className="italic">
                Not listening yet. Hit Start to begin.
              </span>
            )}
          </div>
        </div>

        <div className="card p-4 min-h-[300px]">
          <div className="text-xs uppercase tracking-wider text-mute">
            Notes
          </div>
          <div className="mt-3 space-y-2 max-h-[55vh] overflow-y-auto">
            {notes.length === 0 ? (
              <div className="text-sm text-mute italic">
                Bullet notes will appear here every ~30 seconds of audio.
              </div>
            ) : (
              notes.map((n, i) => (
                <div
                  key={i}
                  className="text-sm leading-relaxed bg-black/20 border border-edge rounded-lg p-2"
                >
                  - {n}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card p-4 min-h-[300px]">
          <div className="text-xs uppercase tracking-wider text-mute">
            Questions for you
          </div>
          <div className="mt-3 space-y-2 max-h-[55vh] overflow-y-auto">
            {questions.length === 0 ? (
              <div className="text-sm text-mute italic">
                Topics that come up will appear as tappable questions.
              </div>
            ) : (
              questions.map((q) => (
                <div
                  key={q.id}
                  className="bg-black/20 border border-edge rounded-lg p-3"
                >
                  <div className="text-sm leading-relaxed">{q.text}</div>
                  {!q.answer && !q.loading && (
                    <button
                      onClick={() => explainQuestion(q)}
                      className="mt-2 text-xs text-accent hover:text-ink"
                    >
                      Explain
                    </button>
                  )}
                  {q.loading && (
                    <div className="mt-2 text-xs text-mute animate-pulse">
                      Explaining...
                    </div>
                  )}
                  {q.answer && (
                    <div className="mt-2 text-xs text-ink/90 leading-relaxed border-t border-edge pt-2 whitespace-pre-wrap">
                      {q.answer}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
