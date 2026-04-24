import { chat, safeParseJson } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 30;

const SYSTEM = `You are ConvoTech, a friendly senior developer helping someone who just got lost in a tech conversation.

Your job: take the confusing moment they share, and give them three things they can actually use in the next 10 seconds of the conversation:

1. "meaning" — the simplest possible explanation (2–3 sentences, no jargon unless you immediately unpack it).
2. "whyItMatters" — one sentence on why this comes up in real-world tech talk.
3. "replies" — an array of exactly 3 short, natural-sounding things they could SAY BACK in the conversation. Not definitions — actual replies. Mix: one curious question, one opinion, one "I've heard X about this" style.

Tone: casual, warm, no hedging. Talk like a real dev friend.`;

const DEEPER_SYSTEM = `You are ConvoTech's "Go Deeper" pass. The user already understood the simple version — now give them a more technical, nuanced take.

Return JSON with:
- "deeper" — 1–2 short paragraphs of the more technical explanation, including real examples, edge cases, or why engineers actually debate this.
- "terms" — an array of 2–4 related terms they'll probably hear next, each with "term" and "oneLiner".`;

export async function POST(req) {
  try {
    const { input, mode = "basic", previous } = await req.json();

    if (!input || typeof input !== "string" || input.trim().length < 3) {
      return Response.json(
        { error: "Please describe the moment you got lost." },
        { status: 400 },
      );
    }

    if (mode === "deeper") {
      const raw = await chat({
        system: DEEPER_SYSTEM,
        messages: [
          {
            role: "user",
            content: `The original confusion: "${input}"

The simple explanation they already saw: "${previous?.meaning || ""}"

Now give them the deeper version as JSON with keys: deeper, terms.`,
          },
        ],
        json: true,
        maxTokens: 700,
      });
      const parsed = safeParseJson(raw) || { deeper: raw, terms: [] };
      return Response.json(parsed);
    }

    const raw = await chat({
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Here's the moment I got lost:

"${input}"

Return JSON with keys: meaning, whyItMatters, replies (array of exactly 3 strings).`,
        },
      ],
      json: true,
      maxTokens: 600,
    });

    const parsed = safeParseJson(raw);
    if (!parsed || !parsed.meaning) {
      return Response.json(
        { error: "Model returned an unexpected response.", raw },
        { status: 502 },
      );
    }

    // normalize replies to exactly 3 strings
    const replies = Array.isArray(parsed.replies)
      ? parsed.replies.slice(0, 3).map(String)
      : [];

    return Response.json({
      meaning: String(parsed.meaning),
      whyItMatters: String(parsed.whyItMatters || ""),
      replies,
    });
  } catch (err) {
    console.error(err);
    return Response.json(
      { error: err.message || "Something went wrong." },
      { status: 500 },
    );
  }
}
