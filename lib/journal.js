// Date-indexed local journal stored in browser localStorage.
// Single source of truth for: /lost lookups, /talk sessions, /listen sessions,
// the "topics" heard recently, daily briefings, and the user's project context.
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
    // quota or other storage issues - silent
  }
}

function emptyDay(date) {
  return { date, listen: [], talk: [], lost: [], topics: [] };
}

function upsertDay(date, updater) {
  const all = readAll();
  const day = all[date] || emptyDay(date);
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

// ---------- Public API: dates ----------

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

// ---------- Public API: per-day writes ----------

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

// ---------- Project context ----------

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
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(PROJECT_KEY, JSON.stringify(clean));
    return clean;
  } catch {
    return null;
  }
}

/**
 * Bundles everything the /brief prompt needs:
 * - project context (static-ish, user-set)
 * - recent meeting topics (dynamic, from listen sessions)
 * - recent lost lookups (dynamic, things you asked about)
 *
 * Hard-capped so it doesn't bloat the prompt as the journal grows.
 */
export function getBriefContext() {
  const project = getProject();
  const recentTopics = getLatestTopics({ maxDays: 7, max: 10 });
  const recentLookups = getRecentLostInputs({ maxDays: 7, max: 6 });
  return {
    project,
    recentTopics: recentTopics.map((t) => t.topic),
    recentLookups: recentLookups.map((l) => l.input),
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
