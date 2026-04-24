# ConvoTech

Learn tech by talking, not studying.

A Next.js app with two modes:

- **I'm Lost** — paste a moment you got confused in a real tech conversation. Get a plain-English explanation, why it matters, and 3 natural replies to jump back in. Hit **Go Deeper** for a more technical pass and a few related terms to watch for.
- **Tech Talk** — a casual back-and-forth with an AI "senior dev." It starts a topic, you reply, it keeps the thread alive. Hit **Change topic** any time.

The AI call is behind a tiny adapter (`lib/ai.js`) so you can point it at OpenAI or Anthropic with one env var. No SDKs, just `fetch`.

## Quick start

```bash
# 1. install
npm install

# 2. configure your provider
cp .env.local.example .env.local
# then edit .env.local and set AI_PROVIDER + the matching API key

# 3. run
npm run dev
```

Open http://localhost:3000.

## Swapping the AI provider

The adapter speaks two protocols: OpenAI's chat-completions format (which Groq, OpenRouter, Ollama, and together.ai all implement) and Anthropic's Messages API. Your app code only ever calls `chat({ system, messages, json })`.

### Free path — Google Gemini (recommended for starting)

1. Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) — sign in with any Google account.
2. Click **Create API key**, copy it.
3. In `.env.local`:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=AIza...
OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
OPENAI_MODEL=gemini-2.0-flash
```

That's it. Gemini's free tier has real per-minute and per-day quotas that are generous enough for building and personal use. No credit card required. If you want snappier replies, try `gemini-2.0-flash-lite`; if you want smarter ones, try `gemini-2.5-flash` or `gemini-2.5-pro`.

### Other options

| Provider     | `AI_PROVIDER` | `OPENAI_BASE_URL`                                          | Notes                                      |
| ------------ | ------------- | ---------------------------------------------------------- | ------------------------------------------ |
| Gemini       | `openai`      | `https://generativelanguage.googleapis.com/v1beta/openai`  | Free tier, no CC required                  |
| Groq         | `openai`      | `https://api.groq.com/openai/v1`                           | Free, very fast, Llama models              |
| OpenAI       | `openai`      | *(leave unset)*                                            | Paid, `gpt-4o-mini` is cheap and good      |
| OpenRouter   | `openai`      | `https://openrouter.ai/api/v1`                             | Mix of free + paid models behind one key   |
| Ollama       | `openai`      | `http://localhost:11434/v1`                                | Local, no key, set `OPENAI_API_KEY=ollama` |
| Anthropic    | `anthropic`   | n/a                                                        | Paid, uses Claude models                   |

See `.env.local.example` for copy-paste blocks for each.

## Project layout

```
app/
  layout.js          # shared header + background
  page.js            # home with two mode buttons
  lost/page.js       # "I'm Lost" UI
  talk/page.js       # "Tech Talk" chat UI
  api/
    lost/route.js    # POST — returns { meaning, whyItMatters, replies }
    talk/route.js    # POST — returns { reply }
lib/
  ai.js              # provider-agnostic chat() + safeParseJson()
```

## Prompts — where the quality lives

Two prompts do most of the work:

- `app/api/lost/route.js` → `SYSTEM` — structured JSON response with 3 conversational replies, not definitions.
- `app/api/talk/route.js` → `SYSTEM` — short, opinionated senior-dev turns, always ending with a question or hook.

These are the knobs to tune. If the vibe feels off, edit those two constants first.

## Ideas for next pass

- Persist the last 5 "I'm Lost" lookups in localStorage as a "study list."
- Voice mode — Whisper in, TTS out — to practice hearing tech English.
- Trending topics pulled from Hacker News so starters stay fresh.
- "Sound smarter" mode that rewrites your reply before you send it.

## Deploying

This is Next.js 14 with the App Router. `npm run build` + `npm start` locally, or push to Vercel and set the env vars in the project settings.
