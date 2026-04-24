import { chat, safeParseJson } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 30;

const SYSTEM = `You are ConvoTech's meeting listener. A chunk of a live meeting transcript will be given to you.

Your job: extract two things as JSON.

1. "notes" — a short bullet list of what was said in THIS chunk that is worth remembering. 1–4 bullets, each 1 sentence, plain English, no headings. Skip filler. If nothing substantial was said, return an empty array.

2. "questions" — a list of topics or concepts that came up which the user might not fully understand, phrased as natural questions they'd ask a friend. Examples:
   "What's an MCP server?"
   "Why do people argue about microservices?"
   "What does 'shipping with agents' mean?"
   0–5 questions. Be specific to what was discussed, not generic. If a question would be identical to one already in "Recent questions so far," skip it.

Rules:
- Never repeat a note that is already in "Recent notes so far."
- Never repeat a question that is already in "Recent questions so far."
- Output ONLY a JSON object with keys "notes" and "questions". No prose.`;

export async function POST(req) {
  try {
    const {
      chunk = "",
      recentNotes = [],
      recentQuestions = [],
    } = await req.json();

    if (!chunk || chunk.trim().length < 20) {
      return Response.json({ notes: [], questions: [] });
    }

    const userPrompt = `Recent notes so far:
${(recentNotes || []).map((n) => `- ${n}`).join("\n") || "(none)"}

Recent questions so far:
${(recentQuestions || []).map((q) => `- ${q}`).join("\n") || "(none)"}

New transcript chunk:
"""
${chunk}
"""

Return JSON: { "notes": [...], "questions": [...] }`;

    const raw = await chat({
      system: SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
      json: true,
      maxTokens: 600,
    });

    const parsed = safeParseJson(raw);
    const notes = Array.isArray(parsed?.notes) ? parsed.notes.slice(0, 6).map(String) : [];
    const questions = Array.isArray(parsed?.questions) ? parsed.questions.slice(0, 5).map(String) : [];

    return Response.json({ notes, questions });
  } catch (err) {
    console.error("digest error:", err);
    return Response.json(
      { error: err.message || "digest failed", notes: [], questions: [] },
      { status: 500 },
    );
  }
}
