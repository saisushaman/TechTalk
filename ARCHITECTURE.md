# ConvoTech — Architecture & Reference

A single-page reference for what's actually in the codebase today. Covers
dependencies, API keys, data flow, and where your data lives.

---

## 1. What the app is, at a glance

Four modes that share one journal:

| Mode | Path | What it does |
|------|------|-------------|
| I'm Lost | `/lost` | Paste a confusion -> get meaning + why it matters + 3 ready-to-use replies |
| Listen | `/listen` | Live mic capture -> running notes + tappable questions you can click to explain |
| Tech Talk | `/talk` | Casual chat with a senior-dev persona, optionally seeded with recent topics from your journal |
| Briefing | `/brief` | Daily personalized digest from 6 sources, reasoned against your project |

All four write to the same date-indexed journal, so what you do in one mode
informs the others.

---

## 2. Packages used (dependencies)

From `package.json`:

### Runtime dependencies
- **`next@14.2.15`** — React framework + router + API routes + build system
- **`react@^18.3.1`** + **`react-dom@^18.3.1`** — UI library

That's it. Three runtime packages. **No database driver, no auth library, no
SDK for OpenAI or Anthropic.** All AI API calls go through raw `fetch()` in
`lib/ai.js`.

### Build-time dev dependencies
- **`tailwindcss@^3.4.14`** — utility-first CSS
- **`postcss@^8.4.47`** — CSS processor (Tailwind runs on top of this)
- **`autoprefixer@^10.4.20`** — adds browser vendor prefixes

Six packages total.

---

## 3. API keys — what you need, what each does

You only ever need **one** key for the whole app, regardless of how many
features you use. The AI adapter (`lib/ai.js`) is provider-agnostic.

### What's configured in `.env.local`

```env
AI_PROVIDER=openai
OPENAI_API_KEY=gsk_...                            # your Groq key
OPENAI_BASE_URL=https://api.groq.com/openai/v1    # any OpenAI-compatible endpoint
OPENAI_MODEL=llama-3.3-70b-versatile
```

### Which key to use — cheat sheet

| Provider | Cost | Where to get | Notes |
|----------|------|--------------|-------|
| **Groq** | Free tier | console.groq.com | Very fast, current recommendation |
| OpenAI | Paid | platform.openai.com | Most expensive but best-in-class |
| Gemini | Free tier | aistudio.google.com | Regional/account gotchas possible |
| Anthropic | Paid | console.anthropic.com | Set `AI_PROVIDER=anthropic` and use `ANTHROPIC_API_KEY` |
| OpenRouter | Mixed | openrouter.ai | Some free models, one key for many providers |
| Ollama | Free (local) | ollama.com | Runs on your machine, no key needed |

The `lib/ai.js` file auto-routes based on `AI_PROVIDER` and `OPENAI_BASE_URL`.
Nothing else in the app changes when you swap providers.

### What your key gets used for

The same key powers every AI call in the app:

- `/api/lost` -> 1 call per lookup
- `/api/talk` -> 1 call per message + 1 call when seeding from journal topics
- `/api/listen/digest` -> 1 call every ~30 seconds during Listen mode
- `/api/listen/explain` -> 1 call per question card you tap
- `/api/brief/fetch` -> ~6-8 calls per briefing refresh (one per item)

The heaviest mode by far is **Briefing** (6-8 parallel LLM calls on fetch).
Listen is the second heaviest in long sessions.

---

## 4. External APIs used (no key required)

Beyond the AI provider, the Briefing pulls from free, no-auth sources:

| Source | URL | Used for |
|--------|-----|----------|
| Hacker News | `https://hacker-news.firebaseio.com/v0/...` | Top stories, filtered by AI keywords |
| Anthropic News | `https://www.anthropic.com/news/rss.xml` | Claude release announcements |
| OpenAI Blog | `https://openai.com/blog/rss.xml` | OpenAI releases |
| Hugging Face Blog | `https://huggingface.co/blog/feed.xml` | Open-source model drops |
| Google DeepMind Blog | `https://deepmind.google/blog/rss.xml` | Gemini + research |
| Simon Willison | `https://simonwillison.net/atom/everything/` | Practitioner LLM notes |

All fetched server-side with 6-8s timeouts each. If any feed is down, the brief
gracefully degrades to the sources that still work.

---

## 5. Listen mode — how it actually works

### The flow

1. You hit **Start listening** in `/listen`.
2. Browser asks for microphone permission (one-time).
3. The app uses the browser-native **Web Speech API** (`SpeechRecognition`) to
   transcribe mic audio to text in real time. This is not a local model —
   Chrome's implementation streams audio to Google's speech servers and
   returns text. (That's why `Listen` works in Chrome and Edge but not Firefox
   or Safari.)
4. As text arrives, it accumulates in a buffer.
5. Every 30 seconds, the accumulated chunk is POSTed to `/api/listen/digest`.
6. The digest route calls your LLM once with that chunk + recent context, and
   returns JSON: `{ notes: [...], questions: [...] }`.
7. Notes are deduped and added to the Notes pane. Questions are added to the
   Questions pane as tappable cards, capped at 8 visible.
8. When you tap **Explain** on a question, `/api/listen/explain` is called
   once to produce a 2-3 sentence answer rendered inline on that card.
9. When you hit **Stop**, the full session (transcript, notes, topics) is
   saved to today's journal entry.

### What leaves your machine during Listen mode

| Data | Goes to | Why |
|------|---------|-----|
| Raw audio | Google (via browser Speech API) | Transcription |
| Transcribed text chunks | Your AI provider (Groq/OpenAI/etc.) | Note + question extraction |
| Individual questions when you tap Explain | Your AI provider | Answer generation |

### What stays on your device

| Data | Lives where |
|------|-------------|
| Full transcript | Browser localStorage, only after you hit Stop |
| Notes list | Browser localStorage |
| Questions list | Browser localStorage |

---

## 6. Storage — where everything actually lives

### **The short answer: browser localStorage. Not MongoDB. Not Postgres. Not a cloud. No server database at all.**

Everything you generate — Lost lookups, Listen sessions, Talk conversations,
Briefings, project context — lives in your browser's localStorage under two
keys:

- `convotech:journal:v1` — the date-indexed journal
- `convotech:project:v1` — your project context

### Shape of the journal

```json
{
  "2026-04-24": {
    "date": "2026-04-24",
    "lost":   [{ id, askedAt, input, meaning, whyItMatters, replies }],
    "listen": [{ id, endedAt, transcript, notes, topics }],
    "talk":   [{ id, endedAt, seededFrom, messages }],
    "topics": ["MCP servers", "context windows", "RAG"],
    "brief":  { fetchedAt, items, sources }
  },
  "2026-04-23": { ... }
}
```

### Shape of project context (separate key)

```json
{
  "building": "ConvoTech — learn tech by conversation",
  "stack": "Next.js 14, Groq llama-3.3, localStorage",
  "stage": "prototype",
  "curiosity": "voice mode, agent loops",
  "stuckOn": "making AI tone casual without being unhelpful",
  "updatedAt": "2026-04-24T10:00:00.000Z"
}
```

### What this means in practice

- Your data **never leaves your browser** unless it's part of an AI call
  (transcript chunk, chat message, feed item).
- There is **no user account**, no login, no sync.
- Your laptop's journal and your phone's journal are **completely separate**.
- Clearing your browser's site data wipes everything.
- Each browser profile has its own journal.

---

## 7. File map — where to find things

```
AItechtalk/
├── app/
│   ├── page.js                    Home + timeline
│   ├── layout.js                  Shared header + nav
│   ├── globals.css                Tailwind + design tokens
│   ├── lost/page.js               "I'm Lost" UI
│   ├── listen/page.js             Listen mode UI (mic, captions, notes, questions)
│   ├── talk/page.js               Tech Talk chat UI
│   ├── brief/page.js              Briefing reading surface
│   └── api/
│       ├── lost/route.js          Lookup -> meaning + replies
│       ├── talk/route.js          Chat turn, with optional topic seeding
│       ├── listen/
│       │   ├── digest/route.js    30s chunk -> notes + questions
│       │   └── explain/route.js   Question -> 2-3 sentence answer
│       └── brief/
│           └── fetch/route.js     6 sources -> ranked -> per-item LLM -> reasoned items
├── components/
│   ├── JournalTimeline.js         Home page 7-day recap
│   └── ProjectContextForm.js      Briefing onboarding form
├── lib/
│   ├── ai.js                      Provider-agnostic chat adapter (OpenAI, Anthropic, any compat)
│   └── journal.js                 localStorage read/write + getBriefContext() bundler
├── .env.local                     (git-ignored) your API key + config
├── .env.local.example             template showing all provider options
├── package.json                   6 packages, nothing extra
└── README.md                      quick start
```

---

## 8. Where quality actually lives (prompt files)

If the AI output feels off — too chatty, too generic, wrong tone — these are
the files to edit:

| File | What it controls |
|------|------------------|
| `app/api/lost/route.js` -> `SYSTEM` | "I'm Lost" tone + structure of meaning/replies |
| `app/api/talk/route.js` -> `SYSTEM` | Senior-dev chat tone, short turns, always-end-with-question rule |
| `app/api/listen/digest/route.js` -> `SYSTEM` | What counts as a note vs. a surface-able question |
| `app/api/listen/explain/route.js` -> `SYSTEM` | Format of the explanation shown on question cards |
| `app/api/brief/fetch/route.js` -> `PER_ITEM_SYSTEM` | The 3-block briefing structure + verdict rules |

Prompts are the knobs. Code rarely needs touching for output quality.

---

## 9. Privacy summary (for when you show this to someone)

- **Your data lives in your browser.** No cloud, no database, no analytics.
- **Audio is transcribed by Google** via the browser's Speech API during Listen mode.
- **Text excerpts go to your AI provider** (Groq/OpenAI/etc.) for every AI call.
- **RSS feeds and Hacker News** are read from the Vercel server (or your dev
  machine), not from your browser, so those sources never see your IP directly
  when deployed.
- **No third-party trackers, no ads, no telemetry** in the app itself. Vercel
  collects standard deployment analytics if you host there.
