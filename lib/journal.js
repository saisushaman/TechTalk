// Date-indexed local journal stored in browser localStorage.
// Single source of truth for: /lost lookups, /talk sessions, /listen sessions,
// the "topics" heard recently, daily briefings, user feedback, preferences,
// and the user's project context.
//
// All reads/writes are defensive - corrupted JSON, missing keys, SSR, and
// browsers without localStorage all degrade to sensible defaults.

const STORAGE_KEY = "convotech:journal:v1";
const PROJECT_KEY = "convotech:project:v1";

function hasStorage() {
  if (typeof window === "undefined") return false;
  try {
    return !!window.localStorage;
  } catch {
    return false;
  }
}

function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function readAll() {
  if (!hasStorage()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeAll(data) {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // quota - silent fail
  }
}

function emptyDay(date) {
  return {
    date,
    listen: [],
    talk: [],
    lost: [],
    topics: [],
    feedback: [],
  };
}

function upsertDay(date, updater) {
  const all = readAll();
  const day = all[date] || emptyDay(date);
  // backfill feedback array for days saved before this feature existed
  if (!Array.isArray(day.feedback)) day.feedback = [];
  const next = updater(day) || day;
  all[date] = next;
  writeAll(all);
  return next;
}

function randomId() {
  return (
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36).slice(-4)
  );
}

function dedupMerge(existing, incoming) {
  const seen = new Set((existing || []).map((t) => t.toLowerCase().trim()));
  const out = [...(existing || [])];
  for (const t of incoming || []) {
    const k = (t || "").toLowerCase().trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// ---------- Dates ----------

export function todayKey() {
  return dateKey();
}

export function getDay(date = dateKey()) {
  const all = readAll();
  return all[date] || emptyDay(date);
}

export function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return getDay(dateKey(d));
}

export function getRecentDays(n = 7) {
  const all = readAll();
  const keys = Object.keys(all)
    .filter((k) => DATE_KEY_REGEX.test(k))
    .sort()
    .reverse()
    .slice(0, n);
  return keys.map((k) => all[k]);
}

export function getLatestTopics({ maxDays = 3, max = 12 } = {}) {
  const all = readAll();
  const keys = Object.keys(all)
    .filter((k) => DATE_KEY_REGEX.test(k))
    .sort()
    .reverse()
    .slice(0, maxDays);
  const seen = new Set();
  const out = [];
  for (const k of keys) {
    const day = all[k];
    for (const t of day.topics || []) {
      const key = (t || "").toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ topic: t, date: k });
      if (out.length >= max) return out;
    }
  }
  return out;
}

export function getRecentLostInputs({ maxDays = 7, max = 10 } = {}) {
  const all = readAll();
  const keys = Object.keys(all)
    .filter((k) => DATE_KEY_REGEX.test(k))
    .sort()
    .reverse()
    .slice(0, maxDays);
  const seen = new Set();
  const out = [];
  for (const k of keys) {
    const day = all[k];
    for (const l of day.lost || []) {
      const input = (l.input || "").trim();
      if (!input) continue;
      const normalized = input.toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      out.push({ input, date: k });
      if (out.length >= max) return out;
    }
  }
  return out;
}

// ---------- Per-day writes ----------

export function addLostLookup(entry) {
  const date = dateKey();
  upsertDay(date, (day) => {
    day.lost = [
      { id: randomId(), askedAt: new Date().toISOString(), ...entry },
      ...(day.lost || []),
    ];
    return day;
  });
}

export function addTalkSession(session) {
  const date = dateKey();
  upsertDay(date, (day) => {
    day.talk = [
      { id: randomId(), endedAt: new Date().toISOString(), ...session },
      ...(day.talk || []),
    ];
    return day;
  });
}

export function addListenSession(session) {
  const date = dateKey();
  upsertDay(date, (day) => {
    day.listen = [
      { id: randomId(), endedAt: new Date().toISOString(), ...session },
      ...(day.listen || []),
    ];
    day.topics = dedupMerge(day.topics, session.topics || []);
    return day;
  });
}

// ---------- Briefing storage ----------

export function setDayBrief(date, brief) {
  const d = date || dateKey();
  upsertDay(d, (day) => {
    day.brief = {
      fetchedAt: new Date().toISOString(),
      ...brief,
    };
    return day;
  });
}

export function getDayBrief(date = dateKey()) {
  const day = getDay(date);
  return day.brief || null;
}

// ---------- Feedback (the thumbs up/down signal) ----------

/**
 * Record a 👍/👎 on any suggestion.
 * entry: { surface, subject, vote, detail? }
 *   surface: "brief" | "lost" | "talk" | "listen"
 *   subject: short label (e.g. brief item title, or the reply text)
 *   vote: 1 | -1
 *   detail: optional free-text comment
 */
export function addFeedback(entry) {
  if (!entry || (entry.vote !== 1 && entry.vote !== -1)) return;
  const date = dateKey();
  upsertDay(date, (day) => {
    day.feedback = [
      {
        id: randomId(),
        at: new Date().toISOString(),
        surface: String(entry.surface || "unknown"),
        subject: String(entry.subject || "").slice(0, 200),
        vote: entry.vote,
        detail: entry.detail ? String(entry.detail).slice(0, 500) : null,
      },
      ...(day.feedback || []),
    ];
    return day;
  });
}

export function getRecentFeedback({ maxDays = 14, max = 40 } = {}) {
  const all = readAll();
  const keys = Object.keys(all)
    .filter((k) => DATE_KEY_REGEX.test(k))
    .sort()
    .reverse()
    .slice(0, maxDays);
  const out = [];
  for (const k of keys) {
    for (const f of all[k].feedback || []) {
      out.push(f);
      if (out.length >= max) return out;
    }
  }
  return out;
}

/**
 * Compact liked/disliked summary for prompts. Dedupes by subject.
 */
export function getFeedbackSummary({ maxLiked = 8, maxDisliked = 8 } = {}) {
  const recent = getRecentFeedback({ maxDays: 30, max: 80 });
  const liked = [];
  const disliked = [];
  const seenLiked = new Set();
  const seenDisliked = new Set();
  for (const f of recent) {
    const k = (f.subject || "").toLowerCase().trim();
    if (!k) continue;
    if (f.vote === 1 && !seenLiked.has(k) && liked.length < maxLiked) {
      liked.push(f.subject);
      seenLiked.add(k);
    } else if (f.vote === -1 && !seenDisliked.has(k) && disliked.length < maxDisliked) {
      disliked.push(f.subject);
      seenDisliked.add(k);
    }
  }
  return { liked, disliked };
}

// ---------- Project context + preferences ----------

export function getProject() {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(PROJECT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setProject(project) {
  if (!hasStorage()) return;
  try {
    const clean = {
      building: String(project?.building || "").trim(),
      stack: String(project?.stack || "").trim(),
      stage: String(project?.stage || "").trim(),
      curiosity: String(project?.curiosity || "").trim(),
      stuckOn: String(project?.stuckOn || "").trim(),
      preferences: String(project?.preferences || "").trim(),
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(PROJECT_KEY, JSON.stringify(clean));
    return clean;
  } catch {
    return null;
  }
}

// ---------- RAG: build a compact, searchable pool of past entries ----------

/**
 * Flatten journal into short text snippets the server can lexically search
 * against a feed item title. Each snippet is tagged with date + type so the
 * LLM can reference it when citing relevant past context.
 * Capped so it doesn't bloat the request body.
 */
export function buildSearchPool({ maxDays = 30, maxSnippets = 80 } = {}) {
  const all = readAll();
  const keys = Object.keys(all)
    .filter((k) => DATE_KEY_REGEX.test(k))
    .sort()
    .reverse()
    .slice(0, maxDays);
  const out = [];
  for (const k of keys) {
    const day = all[k];

    // Listen: topics are the cleanest signal; notes next; transcript excerpt last
    for (const t of day.topics || []) {
      out.push({ date: k, type: "topic", text: t });
      if (out.length >= maxSnippets) return out;
    }
    for (const s of day.listen || []) {
      for (const n of s.notes || []) {
        out.push({ date: k, type: "note", text: n });
        if (out.length >= maxSnippets) return out;
      }
    }

    // Lost: the confusion itself + meaning
    for (const l of day.lost || []) {
      if (l.input) {
        out.push({
          date: k,
          type: "lookup",
          text: `${l.input}${l.meaning ? " — " + l.meaning : ""}`.slice(0, 300),
        });
        if (out.length >= maxSnippets) return out;
      }
    }

    // Talk: first assistant message of each session tends to be the topic hook
    for (const t of day.talk || []) {
      const firstAssistant = (t.messages || []).find((m) => m.role === "assistant");
      if (firstAssistant?.content) {
        out.push({
          date: k,
          type: "talk",
          text: firstAssistant.content.slice(0, 260),
        });
        if (out.length >= maxSnippets) return out;
      }
    }
  }
  return out;
}

/**
 * Bundles everything the /brief prompt needs.
 * Passed to /api/brief/fetch and merged into every per-item LLM call.
 */
export function getBriefContext() {
  const project = getProject();
  const recentTopics = getLatestTopics({ maxDays: 7, max: 10 });
  const recentLookups = getRecentLostInputs({ maxDays: 7, max: 6 });
  const feedback = getFeedbackSummary();
  const searchPool = buildSearchPool();
  return {
    project,
    recentTopics: recentTopics.map((t) => t.topic),
    recentLookups: recentLookups.map((l) => l.input),
    feedback,
    searchPool,
  };
}

// ---------- Clear ----------

export function clearAll() {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(PROJECT_KEY);
  } catch {
    // noop
  }
}
