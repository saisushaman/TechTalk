import { chat } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 30;

const SYSTEM = `You are a friendly senior developer answering a quick question from someone who just heard a topic in a meeting and wants a fast, useful explanation.

Style:
- 2–3 sentences total. That's it.
- Plain English. If you must use a term, define it in the same sentence.
- End with one practical hook — a real example, a comparison, or "you'll mostly hear this when...".
- Never start with "Great question" or similar filler.`;

export async function POST(req) {
  try {
    const { question = "", context = "" } = await req.json();
    if (!question || question.trim().length < 2) {
      return Response.json({ error: "No question provided." }, { status: 400 });
    }

    const userPrompt = context
      ? `Context from the meeting (for your own understanding, don't quote it):
"""
${context}
"""

Question: ${question}`
      : `Question: ${question}`;

    const answer = await chat({
      system: SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 250,
    });

    return Response.json({ answer });
  } catch (err) {
    console.error("explain error:", err);
    return Response.json(
      { error: err.message || "explain failed" },
      { status: 500 },
    );
  }
}
