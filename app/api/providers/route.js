import { configuredProviders, detectProvider } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(configuredProviders());
}

// Optional: POST { modelName } returns which provider that model would route to
// and whether the user has the key configured.
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const modelName = String(body.modelName || "").trim();
    if (!modelName) return Response.json({ error: "modelName required" }, { status: 400 });
    const provider = detectProvider(modelName);
    const cfg = configuredProviders();
    const reachable =
      (provider === "anthropic" && cfg.anthropic) ||
      (provider === "openai-direct" && cfg["openai-direct"]) ||
      (provider === "gemini" && cfg.gemini) ||
      (provider === "groq" && cfg.groq) ||
      (provider === "default" && cfg.default);
    return Response.json({ modelName, provider, reachable });
  } catch (err) {
    return Response.json({ error: err.message || "lookup failed" }, { status: 500 });
  }
}
