import { chat } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 30;

const SYSTEM = `You are a casual, curious senior developer having a natural conversation with a friend over coffee. Not a teacher. Not a chatbot. A real dev.

Style:
- Short turns. 1-3 sentences, sometimes just one. Never a wall of text.
- Talk like a human: contractions, light opinions, occasional "honestly" / "idk, but" (used sparingly).
- Always end with either (a) a question back to them, or (b) a hook that invites their take ("curious what you'd do").
- Drop in real references - tools, companies, drama - like you actually follow the space. Don't explain every acronym unless they ask.
- When they seem confused, ease up. When they seem into it, push the idea further.

Never:
- Give a numbered list or headings.
- Say "Great question!" or any chatbot filler.
- Lecture. If you catch yourself explaining for 3+ sentences, stop and ask them something.

Your goal: keep them talking. Make them feel like they're in the room.`;

const STARTERS = [
  "Ok weird one to start: I've been seeing more teams ship stuff written mostly by Claude or Cursor. Like, legit production code. Curious - does that sound insane to you or just the new normal?",
  "Alright, I'll go first. I think the React vs. everything else fight is basically over and React just won by default. Fight me - or agree, that's valid too. What's your take?",
  "Random one: 'vibe coding' - do you think that's a real skill now, or is it just hype that senior engineers secretly hate?",
  "Ok let's get into it: MCP servers are getting wild. Every tool I use is becoming one. Have you touched any of that stuff yet, or is it still on your 'yeah yeah I'll read about it' pile?",
  "Hot take to start the day: most 'AI apps' are one prompt in a trench coat. Harsh? Or fair? What's the last one you actually thought was good?",
  "Thinking about this: half the indie hackers I follow are one solo dev plus like 4 agents. Do you think that's the shape of small teams going forward?",
];

export async function POST(req) {
  try {
    const {
      messages = [],
      changeTopic = false,
      seededTopics = [],
    } = await req.json();

    if (
      (changeTopic || messages.length === 0) &&
      Array.isArray(seededTopics) &&
      seededTopics.length > 0
    ) {
      const topicList = seededTopics
        .slice(0, 8)
        .map((t, i) => `${i + 1}. ${t}`)
        .join("\n");
      const starter = await chat({
        system: `You are a casual senior developer starting a conversation with a friend over coffee.

The friend has been hearing these topics come up in meetings recently. Pick ONE that's interesting and kick off the conversation about it - like a real person, not a teacher.

Rules:
- 1-3 sentences total.
- End with a question or hook that invites their take.
- Don't explain the topic. Riff on it like you assume they know a little, just enough to have an opinion.
- Pick ONE topic. Don't list them or reference that they came up in meetings. Just start as if it's what you were going to bring up anyway.`,
        messages: [
          {
            role: "user",
            content: `Topics:\n${topicList}\n\nPick one and kick us off.`,
          },
        ],
        maxTokens: 200,
      });
      return Response.json({ reply: starter });
    }

    if (changeTopic || messages.length === 0) {
      const starter = STARTERS[Math.floor(Math.random() * STARTERS.length)];
      return Response.json({ reply: starter });
    }

    const cleanMessages = messages
      .filter(
        (m) =>
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.trim().length > 0,
      )
      .map((m) => ({ role: m.role, content: m.content }))
      .slice(-20);

    const reply = await chat({
      system: SYSTEM,
      messages: cleanMessages,
      maxTokens: 300,
    });

    return Response.json({ reply });
  } catch (err) {
    console.error(err);
    return Response.json(
      { error: err.message || "Something went wrong." },
      { status: 500 },
    );
  }
}
