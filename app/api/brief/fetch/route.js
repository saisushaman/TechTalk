import { chat, safeParseJson } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Feed sources
// ---------------------------------------------------------------------------

const HN_TOPSTORIES =
  "https://hacker-news.firebaseio.com/v0/topstories.json";
const HN_ITEM = (id) =>
  `https://hacker-news.firebaseio.com/v0/item/${id}.json`;

const RSS_FEEDS = [
  { name: "Anthropic", url: "https://www.anthropic.com/news/rss.xml" },
  { name: "OpenAI", url: "https://openai.com/blog/rss.xml" },
  { name: "Hugging Face", url: "https://huggingface.co/blog/feed.xml" },
  { name: "Google DeepMind", url: "https://deepmind.google/blog/rss.xml" },
  { name: "Simon Willison", url: "https://simonwillison.net/atom/everything/" },
];

const AI_KEYWORDS = [
  "ai", "llm", "gpt", "claude", "gemini", "anthropic", "openai", "deepmind",
  "mistral", "llama", "groq", "nvidia", "cuda", "agent", "agents", "mcp",
  "rag", "embedding", "embeddings", "vector", "fine-tun", "finetun",
  "transformer", "diffusion", "inference", "token", "model", "prompt",
  "cursor", "copilot", "hugging face", "huggingface", "arxiv", "whisper",
  "voice", "multimodal", "context window",
];

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function fetchWithTimeout(url, { timeoutMs = 8000, ...opts } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, {
    ...opts,
    signal: ctrl.signal,
    cache: "no-store",
    headers: {
      "User-Agent": "ConvoTechBriefingBot/1.0 (+personal-use)",
      Accept:
        "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      ...(opts.headers || {}),
    },
  }).finally(() => clearTimeout(timer));
}

function tokenize(s) {
  return (s || "").toLowerCase().match(/[a-z0-9]{2,}/g) || [];
}

// Stopwords so "the claude model" matches on "claude", "model" — not "the"
const STOPWORDS = new Set([
  "the","and","for","with","from","that","this","are","was","were","you","your",
  "has","have","had","but","not","can","will","what","which","they","their",
  "our","its","into","over","about","new","one","two","also","some","all","any",
  "here","there","than","then","out","use","using","uses","up","on","in","to",
  "is","of","a","an","or","at","by","be","as","it","we",
]);

function meaningfulTokens(s) {
  return tokenize(s).filter((t) => !STOPWORDS.has(t) && t.length > 2);
}

// ---------------------------------------------------------------------------
// Hacker News
// ---------------------------------------------------------------------------

function isAiStory(item) {
  if (!item || !item.title) return false;
  const hay = `${item.title} ${item.url || ""}`.toLowerCase();
  return AI_KEYWORDS.some((k) => hay.includes(k));
}

async function fetchHackerNews(maxItems = 5) {
  try {
    const idsRes = await fetchWithTimeout(HN_TOPSTORIES, { timeoutMs: 5000 });
    if (!idsRes.ok) throw new Error("HN topstories failed");
    const ids = await idsRes.json();
    const candidateIds = (ids || []).slice(0, 60);
    const details = await Promise.all(
      candidateIds.map(async (id) => {
        try {
          const r = await fetchWithTimeout(HN_ITEM(id), { timeoutMs: 4000 });
          if (!r.ok) return null;
          return await r.json();
        } catch {
          return null;
        }
      }),
    );
    const ai = details.filter(Boolean).filter(isAiStory).slice(0, maxItems);
    return ai.map((it) => ({
      source: "Hacker News",
      title: it.title,
      url: it.url || `https://news.ycombinator.com/item?id=${it.id}`,
      score: it.score || 0,
      publishedAt: it.time ? new Date(it.time * 1000).toISOString() : null,
    }));
  } catch (err) {
    console.warn("HN fetch error:", err?.message || err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// RSS + Atom parser (zero-dep, regex based)
// ---------------------------------------------------------------------------

function stripTags(s) {
  return (s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchFirst(xml, regex) {
  const m = xml.match(regex);
  return m ? m[1] : "";
}

function matchAllBlocks(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

function parseFeedItem(block) {
  const title = stripTags(matchFirst(block, /<title[^>]*>([\s\S]*?)<\/title>/i));
  let url = stripTags(matchFirst(block, /<link[^>]*>([\s\S]*?)<\/link>/i));
  if (!url) {
    const hrefMatch = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
    if (hrefMatch) url = hrefMatch[1];
  }
  const published =
    matchFirst(block, /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) ||
    matchFirst(block, /<published[^>]*>([\s\S]*?)<\/published>/i) ||
    matchFirst(block, /<updated[^>]*>([\s\S]*?)<\/updated>/i);
  const description =
    stripTags(matchFirst(block, /<description[^>]*>([\s\S]*?)<\/description>/i)) ||
    stripTags(matchFirst(block, /<summary[^>]*>([\s\S]*?)<\/summary>/i)) ||
    stripTags(matchFirst(block, /<content[^>]*>([\s\S]*?)<\/content>/i));
  return {
    title,
    url,
    publishedAt: published ? new Date(published).toISOString() : null,
    description: (description || "").slice(0, 400),
  };
}

function parseFeed(xml) {
  const rssItems = matchAllBlocks(xml, "item");
  const atomEntries = matchAllBlocks(xml, "entry");
  const blocks = rssItems.length ? rssItems : atomEntries;
  return blocks.map(parseFeedItem).filter((it) => it.title && it.url);
}

async function fetchRssSource(feed, perFeedItems = 2) {
  try {
    const r = await fetchWithTimeout(feed.url, { timeoutMs: 6000 });
    if (!r.ok) {
      console.warn(`RSS ${feed.name} HTTP ${r.status}`);
      return [];
    }
    const xml = await r.text();
    const items = parseFeed(xml).slice(0, perFeedItems);
    return items.map((it) => ({
      source: feed.name,
      title: it.title,
      url: it.url,
      publishedAt: it.publishedAt,
      description: it.description,
    }));
  } catch (err) {
    console.warn(`RSS ${feed.name} fetch error:`, err?.message || err);
    return [];
  }
}

async function fetchAllRss() {
  const results = await Promise.all(RSS_FEEDS.map((f) => fetchRssSource(f, 2)));
  return results.flat();
}

// ---------------------------------------------------------------------------
// Rank + dedupe
// ---------------------------------------------------------------------------

function dedupeByUrl(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const k = (it.url || it.title || "").toLowerCase().trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

function ageHours(iso) {
  if (!iso) return 9999;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 9999;
  return (Date.now() - t) / 3600000;
}

function rankItems(items) {
  return items
    .map((it) => {
      const age = ageHours(it.publishedAt);
      const recencyScore = Math.max(0, 72 - age);
      const primarySourceBonus = it.source === "Hacker News" ? 0 : 20;
      const hnScoreBonus =
        it.source === "Hacker News" ? Math.min(30, (it.score || 0) / 10) : 0;
      return { ...it, _rank: recencyScore + primarySourceBonus + hnScoreBonus };
    })
    .sort((a, b) => b._rank - a._rank);
}

// ---------------------------------------------------------------------------
// Lexical retrieval over the client-provided searchPool (lightweight RAG)
// ---------------------------------------------------------------------------

function searchPoolFor(item, pool, topK = 3) {
  if (!Array.isArray(pool) || pool.length === 0) return [];
  const query = `${item.title || ""} ${item.description || ""}`;
  const qTokens = meaningfulTokens(query);
  if (qTokens.length === 0) return [];
  const qSet = new Set(qTokens);

  const scored = [];
  for (const snippet of pool) {
    if (!snippet || !snippet.text) continue;
    const sTokens = meaningfulTokens(snippet.text);
    if (sTokens.length === 0) continue;
    let hits = 0;
    const seen = new Set();
    for (const t of sTokens) {
      if (qSet.has(t) && !seen.has(t)) {
        hits += 1;
        seen.add(t);
      }
    }
    if (hits === 0) continue;
    // small boost for short focused snippets (topics are usually most signal)
    const brevityBoost = snippet.type === "topic" ? 0.5 : 0;
    const score = hits / Math.sqrt(sTokens.length) + brevityBoost;
    scored.push({ ...snippet, _score: score });
  }
  return scored.sort((a, b) => b._score - a._score).slice(0, topK);
}

// ---------------------------------------------------------------------------
// LLM enrichment
// ---------------------------------------------------------------------------

const PER_ITEM_SYSTEM = `You are the editor of a personal tech briefing. For each feed item, produce a structured reasoned assessment for a specific person based on what you know about them.

Output ONLY JSON with this exact shape:
{
  "whatItIs": "2 neutral sentences. Facts only. No hype. If you're not sure about a specific spec (version, price, benchmark), write 'per the announcement' rather than asserting it as fact.",
  "verdict": "strong fit" | "worth exploring" | "not right now" | "future interest",
  "fitReasoning": "One short paragraph (3-5 sentences). Reference the person's actual stack, stage, and recent signals. Weigh tradeoffs honestly. If it's not a fit, say so and explain why - that's equally useful.",
  "tryIt": "A concrete next step in 1-3 short sentences or bullet-style lines. If it's a config change, name the env vars or install command. If it's a read, name the specific doc. If the verdict is 'not right now', say what they should watch for instead."
}

Rules:
- If PREFERENCES says "prefer X / skip Y", obey it. It overrides your defaults.
- If LIKED/DISLIKED lists are present, bias toward the style of LIKED items and away from DISLIKED ones.
- If RELATED NOTES FROM PAST JOURNAL are present, reference the specific past moment when it's genuinely relevant ("you flagged MCP servers last Tuesday"). Don't shoehorn it.
- Consider at least one competing viewpoint before settling on a verdict.
- Never add prose outside the JSON. Never use markdown fences.`;

function buildContextBlock({ project, recentTopics, recentLookups, feedback }) {
  const p = project || {};
  const lines = [];
  lines.push("PERSON:");
  lines.push(`- Building: ${p.building || "(not specified)"}`);
  lines.push(`- Stack: ${p.stack || "(not specified)"}`);
  lines.push(`- Stage: ${p.stage || "(not specified)"}`);
  lines.push(`- Curious about: ${p.curiosity || "(not specified)"}`);
  if (p.stuckOn) lines.push(`- Stuck on: ${p.stuckOn}`);

  if (p.preferences) {
    lines.push("");
    lines.push("PREFERENCES (explicit, user-set - obey these):");
    lines.push(p.preferences);
  }

  if (feedback && (feedback.liked?.length || feedback.disliked?.length)) {
    lines.push("");
    lines.push("USER FEEDBACK HISTORY:");
    if (feedback.liked?.length) {
      lines.push(`- LIKED recently: ${feedback.liked.slice(0, 6).join("; ")}`);
    }
    if (feedback.disliked?.length) {
      lines.push(`- DISLIKED recently: ${feedback.disliked.slice(0, 6).join("; ")}`);
    }
  }

  if (recentTopics && recentTopics.length) {
    lines.push("");
    lines.push("TOPICS IN THEIR MEETINGS RECENTLY:");
    lines.push(recentTopics.slice(0, 8).map((t) => `- ${t}`).join("\n"));
  }
  if (recentLookups && recentLookups.length) {
    lines.push("");
    lines.push("THINGS THEY LOOKED UP RECENTLY:");
    lines.push(recentLookups.slice(0, 5).map((l) => `- ${l}`).join("\n"));
  }
  return lines.join("\n");
}

async function enrichItem(item, contextBlock, relatedSnippets) {
  let relatedBlock = "";
  if (relatedSnippets && relatedSnippets.length) {
    const lines = relatedSnippets.map(
      (s) => `- [${s.date} · ${s.type}] ${s.text}`,
    );
    relatedBlock = `\n\nRELATED NOTES FROM PAST JOURNAL (keyword-matched against the item title):\n${lines.join("\n")}`;
  }

  const descBlock = item.description ? `\n- Description: ${item.description}` : "";
  const userPrompt = `${contextBlock}${relatedBlock}

FEED ITEM:
- Source: ${item.source}
- Title: ${item.title}
- URL: ${item.url}${descBlock}

Now produce the JSON assessment for this person.`;

  try {
    const raw = await chat({
      system: PER_ITEM_SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
      json: true,
      maxTokens: 700,
    });
    const parsed = safeParseJson(raw);
    if (!parsed) return null;
    return {
      source: item.source,
      title: item.title,
      url: item.url,
      publishedAt: item.publishedAt,
      score: item.score,
      whatItIs: String(parsed.whatItIs || ""),
      verdict: String(parsed.verdict || "worth exploring").toLowerCase(),
      fitReasoning: String(parsed.fitReasoning || ""),
      tryIt: String(parsed.tryIt || ""),
      related: (relatedSnippets || []).map((s) => ({
        date: s.date,
        type: s.type,
        text: s.text,
      })),
    };
  } catch (err) {
    console.warn("enrich item failed:", item.title, err?.message || err);
    return null;
  }
}

async function enrichAllBatched(items, contextBlock, searchPool, batchSize = 3) {
  const out = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const slice = items.slice(i, i + batchSize);
    const results = await Promise.all(
      slice.map((it) => {
        const related = searchPoolFor(it, searchPool, 3);
        return enrichItem(it, contextBlock, related);
      }),
    );
    for (const r of results) if (r) out.push(r);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const project = body.project || null;
    const recentTopics = Array.isArray(body.recentTopics) ? body.recentTopics : [];
    const recentLookups = Array.isArray(body.recentLookups) ? body.recentLookups : [];
    const feedback = body.feedback && typeof body.feedback === "object"
      ? body.feedback
      : { liked: [], disliked: [] };
    const searchPool = Array.isArray(body.searchPool) ? body.searchPool : [];

    const [hn, rss] = await Promise.all([fetchHackerNews(5), fetchAllRss()]);
    const allRaw = dedupeByUrl([...rss, ...hn]);
    if (allRaw.length === 0) {
      return Response.json({
        items: [],
        sources: [],
        note: "No stories available right now. Feeds may be temporarily down - try refreshing later.",
      });
    }

    const ranked = rankItems(allRaw).slice(0, 8);
    const contextBlock = buildContextBlock({
      project,
      recentTopics,
      recentLookups,
      feedback,
    });
    const enriched = await enrichAllBatched(ranked, contextBlock, searchPool, 3);
    const sourcesUsed = Array.from(new Set(enriched.map((i) => i.source)));

    return Response.json({
      items: enriched,
      sources: sourcesUsed,
      fetchedAt: new Date().toISOString(),
      personalizationUsed: {
        preferencesPresent: !!(project?.preferences),
        feedbackCount: (feedback.liked?.length || 0) + (feedback.disliked?.length || 0),
        searchPoolSize: searchPool.length,
      },
    });
  } catch (err) {
    console.error("brief fetch error:", err);
    return Response.json(
      { error: err.message || "brief fetch failed", items: [] },
      { status: 500 },
    );
  }
}
