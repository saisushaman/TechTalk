"use client";

import { useEffect, useRef, useState } from "react";
import { addListenSession } from "@/lib/journal";

const FIRST_DIGEST_MS = 10000;
const REPEAT_DIGEST_MS = 30000;
const MIN_CHUNK_CHARS = 10;
const WHISPER_SLICE_MS = 10000; // record 10s chunks then send to Whisper

export default function ListenPage() {
  const [mode, setMode] = useState("whisper"); // "browser" | "whisper"
  const [isListening, setIsListening] = useState(false);
  const [browserSupport, setBrowserSupport] = useState(null);
  const [whisperSupport, setWhisperSupport] = useState(null);
  const [error, setError] = useState("");
  const [captions, setCaptions] = useState("");
  const [notes, setNotes] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [savedMessage, setSavedMessage] = useState("");

  const [diag, setDiag] = useState({
    micActive: false,
    capturedWords: 0,
    pendingChars: 0,
    lastDigestAt: null,
    lastDigestResult: null,
    digestInFlight: false,
    digestCount: 0,
    transcribeChunks: 0,
    lastTranscribeAt: null,
    lastTranscribeMs: null,
  });

  // recognition refs
  const recognitionRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const recorderRef = useRef(null);
  const recorderTimeoutRef = useRef(null);

  // shared transcript state
  const pendingChunkRef = useRef("");
  const fullTranscriptRef = useRef("");

  // digest scheduling
  const digestTimerRef = useRef(null);
  const firstDigestTimerRef = useRef(null);
  const shouldListenRef = useRef(false);
  const sessionStartRef = useRef(null);
  const modeRef = useRef("whisper");

  const notesRef = useRef([]);
  const questionsRef = useRef([]);
  useEffect(() => { notesRef.current = notes; }, [notes]);
  useEffect(() => { questionsRef.current = questions; }, [questions]);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // feature detect both backends
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setBrowserSupport(!!SR);
    setWhisperSupport(
      typeof window.MediaRecorder !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia,
    );
  }, []);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      stopAllRecognition();
      if (digestTimerRef.current) clearInterval(digestTimerRef.current);
      if (firstDigestTimerRef.current) clearTimeout(firstDigestTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopAllRecognition() {
    // browser path
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    // whisper path
    if (recorderTimeoutRef.current) {
      clearTimeout(recorderTimeoutRef.current);
      recorderTimeoutRef.current = null;
    }
    if (recorderRef.current) {
      try {
        if (recorderRef.current.state !== "inactive") recorderRef.current.stop();
      } catch {}
      recorderRef.current = null;
    }
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch {}
      mediaStreamRef.current = null;
    }
  }

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

  function appendTranscript(text) {
    const clean = (text || "").trim();
    if (!clean) return;
    const space =
      pendingChunkRef.current.length > 0 &&
      !pendingChunkRef.current.endsWith(" ")
        ? " "
        : "";
    pendingChunkRef.current += space + clean + " ";
    fullTranscriptRef.current += space + clean + " ";
    setCaptions(fullTranscriptRef.current);
    setDiag((d) => ({
      ...d,
      pendingChars: pendingChunkRef.current.length,
      capturedWords: (fullTranscriptRef.current.match(/\S+/g) || []).length,
    }));
  }

  // ---------- Browser-native Web Speech path ----------
  function startBrowserRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    let interim = "";
    let consecutiveNetworkErrors = 0;

    rec.onstart = () => setDiag((d) => ({ ...d, micActive: true }));

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
      setCaptions(fullTranscriptRef.current + (interim ? " " + interim : ""));
      setDiag((d) => ({
        ...d,
        pendingChars: pendingChunkRef.current.length,
        capturedWords: (fullTranscriptRef.current.match(/\S+/g) || []).length,
      }));
    };

    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed") {
        setError("Microphone permission denied. Allow it in the address bar and try again.");
        shouldListenRef.current = false;
        setIsListening(false);
        setDiag((d) => ({ ...d, micActive: false }));
        return;
      }
      if (e.error === "network") {
        consecutiveNetworkErrors++;
        if (consecutiveNetworkErrors >= 3) {
          setError(
            "Browser speech recognition can't reach Google's servers. Try Whisper mode (more reliable) or check your network.",
          );
        }
        return;
      }
      consecutiveNetworkErrors = 0;
      setError("Mic issue: " + e.error + " - trying to recover.");
    };

    rec.onend = () => {
      setDiag((d) => ({ ...d, micActive: false }));
      if (!shouldListenRef.current) return;
      setTimeout(() => {
        if (!shouldListenRef.current) return;
        try { rec.start(); } catch {}
      }, 400);
    };

    try {
      rec.start();
      recognitionRef.current = rec;
    } catch (e) {
      setError("Couldn't start microphone: " + (e.message || String(e)));
      shouldListenRef.current = false;
      setIsListening(false);
    }
  }

  // ---------- Whisper path (server-side via /api/listen/transcribe) ----------
  function pickWebmMime() {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/ogg",
      "audio/mp4",
      "",
    ];
    for (const c of candidates) {
      if (!c) return "";
      try {
        if (window.MediaRecorder.isTypeSupported(c)) return c;
      } catch {}
    }
    return "";
  }

  async function transcribeBlob(blob) {
    if (!blob || blob.size < 2000) return; // <2KB usually = silence/no speech
    const start = performance.now();
    const mimeExt = (blob.type || "audio/webm").includes("ogg")
      ? "ogg"
      : (blob.type || "").includes("mp4")
      ? "mp4"
      : "webm";
    const fd = new FormData();
    fd.append("file", blob, `chunk.${mimeExt}`);
    try {
      const res = await fetch("/api/listen/transcribe", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        const msg = data.error || `HTTP ${res.status}`;
        setError("Whisper error: " + msg);
        return;
      }
      const elapsed = Math.round(performance.now() - start);
      if (data.text) appendTranscript(data.text);
      setDiag((d) => ({
        ...d,
        transcribeChunks: d.transcribeChunks + 1,
        lastTranscribeAt: new Date().toISOString(),
        lastTranscribeMs: elapsed,
      }));
    } catch (e) {
      setError("Whisper network error: " + (e.message || String(e)));
    }
  }

  async function startWhisperRecognition() {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setError(
        "Couldn't access the microphone: " +
          (e.message || String(e)) +
          ". Allow mic permission and reload.",
      );
      shouldListenRef.current = false;
      setIsListening(false);
      return;
    }
    mediaStreamRef.current = stream;
    setDiag((d) => ({ ...d, micActive: true }));

    const mime = pickWebmMime();

    function startNewRecorderSlice() {
      if (!shouldListenRef.current) return;
      let rec;
      try {
        rec = mime
          ? new MediaRecorder(stream, { mimeType: mime })
          : new MediaRecorder(stream);
      } catch (e) {
        setError("MediaRecorder init failed: " + (e.message || String(e)));
        shouldListenRef.current = false;
        setIsListening(false);
        setDiag((d) => ({ ...d, micActive: false }));
        return;
      }
      recorderRef.current = rec;

      const chunks = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        // fire and forget - don't block the next slice
        transcribeBlob(blob);
        if (shouldListenRef.current) startNewRecorderSlice();
      };
      try {
        rec.start();
      } catch (e) {
        setError("MediaRecorder start failed: " + (e.message || String(e)));
        shouldListenRef.current = false;
        setIsListening(false);
        setDiag((d) => ({ ...d, micActive: false }));
        return;
      }
      recorderTimeoutRef.current = setTimeout(() => {
        try {
          if (rec.state !== "inactive") rec.stop();
        } catch {}
      }, WHISPER_SLICE_MS);
    }

    startNewRecorderSlice();
  }

  // ---------- Digest pipeline (same for both modes) ----------
  async function sendDigest({ force = false } = {}) {
    const chunk = pendingChunkRef.current.trim();
    if (!force && (!chunk || chunk.length < MIN_CHUNK_CHARS)) return;
    if (!chunk && force) {
      setDiag((d) => ({
        ...d,
        lastDigestAt: new Date().toISOString(),
        lastDigestResult: { notes: 0, questions: 0, info: "no transcribed audio yet" },
      }));
      return;
    }
    pendingChunkRef.current = "";
    setDiag((d) => ({
      ...d,
      pendingChars: pendingChunkRef.current.length,
      digestInFlight: true,
    }));
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
      if (!res.ok || data.error) {
        const msg = data.error || `HTTP ${res.status}`;
        setError("Digest call failed: " + msg);
        setDiag((d) => ({
          ...d,
          digestInFlight: false,
          lastDigestAt: new Date().toISOString(),
          lastDigestResult: { error: msg },
          digestCount: d.digestCount + 1,
        }));
        return;
      }

      const incomingNotes = Array.isArray(data.notes) ? data.notes : [];
      const incomingQuestions = Array.isArray(data.questions) ? data.questions : [];
      if (incomingNotes.length) {
        setNotes((prev) => dedupStrings([...prev, ...incomingNotes]));
      }
      if (incomingQuestions.length) {
        setQuestions((prev) => {
          const existing = new Set(prev.map((q) => q.text.toLowerCase().trim()));
          const incoming = incomingQuestions
            .filter((q) => q && !existing.has(q.toLowerCase().trim()))
            .map((q) => ({ id: newId(), text: q }));
          return [...incoming, ...prev].slice(0, 8);
        });
      }
      setDiag((d) => ({
        ...d,
        digestInFlight: false,
        lastDigestAt: new Date().toISOString(),
        lastDigestResult: {
          notes: incomingNotes.length,
          questions: incomingQuestions.length,
        },
        digestCount: d.digestCount + 1,
      }));
    } catch (e) {
      const msg = e.message || String(e);
      setError("Digest network error: " + msg);
      setDiag((d) => ({
        ...d,
        digestInFlight: false,
        lastDigestAt: new Date().toISOString(),
        lastDigestResult: { error: msg },
        digestCount: d.digestCount + 1,
      }));
    }
  }

  // ---------- Lifecycle ----------
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
    setDiag({
      micActive: false,
      capturedWords: 0,
      pendingChars: 0,
      lastDigestAt: null,
      lastDigestResult: null,
      digestInFlight: false,
      digestCount: 0,
      transcribeChunks: 0,
      lastTranscribeAt: null,
      lastTranscribeMs: null,
    });

    if (modeRef.current === "whisper") {
      if (!whisperSupport) {
        setError("Your browser doesn't support MediaRecorder. Try Browser mode.");
        shouldListenRef.current = false;
        setIsListening(false);
        return;
      }
      startWhisperRecognition();
    } else {
      if (!browserSupport) {
        setError("Your browser doesn't support Web Speech API. Try Whisper mode.");
        shouldListenRef.current = false;
        setIsListening(false);
        return;
      }
      startBrowserRecognition();
    }

    firstDigestTimerRef.current = setTimeout(() => sendDigest(), FIRST_DIGEST_MS);
    digestTimerRef.current = setInterval(sendDigest, REPEAT_DIGEST_MS);
  }

  async function stop() {
    shouldListenRef.current = false;
    setIsListening(false);
    stopAllRecognition();
    setDiag((d) => ({ ...d, micActive: false }));

    if (digestTimerRef.current) {
      clearInterval(digestTimerRef.current);
      digestTimerRef.current = null;
    }
    if (firstDigestTimerRef.current) {
      clearTimeout(firstDigestTimerRef.current);
      firstDigestTimerRef.current = null;
    }

    // give the last whisper chunk ~1.5s to come back if mid-flight
    if (modeRef.current === "whisper") {
      await new Promise((r) => setTimeout(r, 1500));
    }
    await sendDigest({ force: true });

    try {
      const finalQuestions = questionsRef.current.map((q) => q.text);
      addListenSession({
        startedAt: sessionStartRef.current,
        transcript: fullTranscriptRef.current.trim(),
        notes: notesRef.current,
        topics: finalQuestions,
        mode: modeRef.current,
      });
      setSavedMessage("Session saved to today's journal.");
    } catch (e) {
      console.warn("journal save failed:", e);
    }
  }

  async function processNow() {
    await sendDigest({ force: true });
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
            ? { ...x, loading: false, answer: data.answer || data.error || "No answer." }
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

  function fmtTime(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  if (browserSupport === false && whisperSupport === false) {
    return (
      <div className="card p-6">
        <h1 className="text-2xl font-semibold">Listen mode</h1>
        <p className="mt-3 text-mute">
          Your browser supports neither Web Speech API nor MediaRecorder. Open
          ConvoTech in a recent Chrome, Edge, Firefox, or Safari to use Listen
          mode.
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
            Only use with everyone&apos;s consent. Audio + transcript are sent
            to your AI provider for processing.
          </p>
        </div>
        {!isListening ? (
          <button onClick={start} className="btn btn-primary">
            Start listening
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={processNow}
              disabled={diag.digestInFlight}
              className="btn btn-ghost"
              title="Force a digest now using current transcript"
            >
              {diag.digestInFlight ? "Processing..." : "Process now"}
            </button>
            <button
              onClick={stop}
              className="btn"
              style={{ background: "#c2443c", color: "white", border: "1px solid #a33" }}
            >
              Stop
            </button>
          </div>
        )}
      </div>

      {/* Mode selector */}
      <div className="card p-3 flex flex-wrap items-center gap-3">
        <span className="text-xs uppercase tracking-wider text-mute">Mode:</span>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            disabled={isListening}
            onClick={() => setMode("whisper")}
            className={`text-xs px-3 py-1.5 rounded-full border transition ${
              mode === "whisper"
                ? "bg-accent text-white border-accent"
                : "bg-black/20 text-mute border-edge hover:text-ink"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            🎙️ Whisper (Groq) — recommended
          </button>
          <button
            type="button"
            disabled={isListening}
            onClick={() => setMode("browser")}
            className={`text-xs px-3 py-1.5 rounded-full border transition ${
              mode === "browser"
                ? "bg-accent text-white border-accent"
                : "bg-black/20 text-mute border-edge hover:text-ink"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            ⚡ Browser (Web Speech, Chrome/Edge)
          </button>
        </div>
        <span className="text-[11px] text-mute">
          {mode === "whisper"
            ? "Records 10s audio chunks, sends to Groq Whisper. Works in any modern browser, no Google dependency."
            : "Free, instant captions via Chrome's built-in API. Flaky on shaky networks; Chrome/Edge only."}
        </span>
      </div>

      {/* Diagnostics strip */}
      {(isListening || diag.digestCount > 0 || diag.transcribeChunks > 0) && (
        <div className="card p-3 text-[11px] text-mute flex flex-wrap gap-x-4 gap-y-1 items-center">
          <span>
            Mic:{" "}
            <span className={diag.micActive ? "text-accent2" : "text-red-300"}>
              {diag.micActive ? "active" : "idle"}
            </span>
          </span>
          <span>Words: <span className="text-ink/80">{diag.capturedWords}</span></span>
          <span>Pending: <span className="text-ink/80">{diag.pendingChars} chars</span></span>
          {modeRef.current === "whisper" && (
            <span>
              Whisper chunks:{" "}
              <span className="text-ink/80">{diag.transcribeChunks}</span>
              {diag.lastTranscribeMs != null && (
                <span className="text-mute"> (last: {diag.lastTranscribeMs}ms)</span>
              )}
            </span>
          )}
          <span>
            Digests: <span className="text-ink/80">{diag.digestCount}</span>
            {" "}<span className="text-mute">(last: {fmtTime(diag.lastDigestAt)})</span>
          </span>
          {diag.lastDigestResult && (
            <span>
              Last result:{" "}
              {diag.lastDigestResult.error ? (
                <span className="text-red-300">error - {diag.lastDigestResult.error}</span>
              ) : diag.lastDigestResult.info ? (
                <span className="text-mute">{diag.lastDigestResult.info}</span>
              ) : (
                <span className="text-ink/80">
                  {diag.lastDigestResult.notes} notes, {diag.lastDigestResult.questions} questions
                </span>
              )}
            </span>
          )}
        </div>
      )}

      {isListening && (
        <div className="flex items-center gap-2 text-xs text-accent2">
          <span className="inline-block w-2 h-2 rounded-full bg-accent2 animate-pulse" />
          Listening{modeRef.current === "whisper" ? " (Whisper, 10s chunks)" : " (Browser)"} - first digest in ~10s, then every ~30s. Use &quot;Process now&quot; to force one.
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
          <div className="text-xs uppercase tracking-wider text-mute">Captions</div>
          <div className="mt-2 text-xs text-mute whitespace-pre-wrap max-h-[55vh] overflow-y-auto leading-relaxed">
            {captions || (<span className="italic">Not listening yet. Hit Start to begin.</span>)}
          </div>
        </div>

        <div className="card p-4 min-h-[300px]">
          <div className="text-xs uppercase tracking-wider text-mute">Notes</div>
          <div className="mt-3 space-y-2 max-h-[55vh] overflow-y-auto">
            {notes.length === 0 ? (
              <div className="text-sm text-mute italic">
                Bullet notes will appear here as the AI processes the transcript.
              </div>
            ) : (
              notes.map((n, i) => (
                <div key={i} className="text-sm leading-relaxed bg-black/20 border border-edge rounded-lg p-2">
                  - {n}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card p-4 min-h-[300px]">
          <div className="text-xs uppercase tracking-wider text-mute">Questions for you</div>
          <div className="mt-3 space-y-2 max-h-[55vh] overflow-y-auto">
            {questions.length === 0 ? (
              <div className="text-sm text-mute italic">
                Topics that come up will appear as tappable questions.
              </div>
            ) : (
              questions.map((q) => (
                <div key={q.id} className="bg-black/20 border border-edge rounded-lg p-3">
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
                    <div className="mt-2 text-xs text-mute animate-pulse">Explaining...</div>
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
