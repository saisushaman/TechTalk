// Proxies a single audio chunk to a Whisper-compatible endpoint
// (Groq, OpenAI, or any provider with /audio/transcriptions).
//
// Body: multipart/form-data with a "file" field (audio/webm preferred,
// audio/mp4 / audio/ogg / audio/wav also accepted by Groq).

export const runtime = "nodejs";
export const maxDuration = 30;

const OPENAI_BASE_URL = (
  process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
).replace(/\/+$/, "");

// Groq's fast Whisper model. Override with WHISPER_MODEL if you want.
// OpenAI users can set WHISPER_MODEL=whisper-1.
const WHISPER_MODEL = process.env.WHISPER_MODEL || "whisper-large-v3-turbo";

export async function POST(req) {
  try {
    const provider = (process.env.AI_PROVIDER || "openai").toLowerCase();
    if (provider !== "openai") {
      return Response.json(
        {
          error:
            "Whisper transcription requires an OpenAI-compatible provider (Groq or OpenAI). Switch AI_PROVIDER=openai in .env.local to use this mode.",
        },
        { status: 400 },
      );
    }

    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      return Response.json(
        { error: "OPENAI_API_KEY is not set" },
        { status: 500 },
      );
    }

    const incoming = await req.formData();
    const file = incoming.get("file");
    if (!file || typeof file === "string") {
      return Response.json(
        { error: "No audio file provided in 'file' field." },
        { status: 400 },
      );
    }

    // Forward as a fresh multipart request to the Whisper endpoint.
    const outgoing = new FormData();
    outgoing.append("file", file, file.name || "audio.webm");
    outgoing.append("model", WHISPER_MODEL);
    outgoing.append("response_format", "json");
    // English-tuned. Drop this line if you want auto-detect.
    outgoing.append("language", "en");
    // Lower temperature = less hallucination on silence
    outgoing.append("temperature", "0");

    const res = await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: outgoing,
    });

    if (!res.ok) {
      const errText = await res.text();
      return Response.json(
        {
          error: `Transcription failed (${res.status}): ${errText.slice(0, 300)}`,
        },
        { status: 502 },
      );
    }

    const data = await res.json().catch(() => null);
    const text = (data?.text || "").trim();
    return Response.json({ text });
  } catch (err) {
    console.error("transcribe error:", err);
    return Response.json(
      { error: err.message || "Transcription failed" },
      { status: 500 },
    );
  }
}
