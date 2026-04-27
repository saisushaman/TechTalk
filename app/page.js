import Link from "next/link";
import JournalTimeline from "@/components/JournalTimeline";

export default function HomePage() {
  return (
    <div className="space-y-10">
      <section className="text-center pt-6">
        <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight">
          Learn tech by <span className="text-accent">talking</span>,
          <br className="hidden sm:block" /> not studying.
        </h1>
        <p className="text-mute mt-4 max-w-xl mx-auto">
          Sit in on meetings. Get instant clarity on anything confusing. Read a
          daily briefing tailored to what you&apos;re building. Compare AI
          models for your stack. Everything you do builds a journal.
        </p>
      </section>

      <section className="grid sm:grid-cols-2 gap-4">
        <Link href="/lost" className="card p-6 hover:border-accent/50 transition group">
          <div className="text-3xl">SOS</div>
          <div className="mt-3 font-semibold text-lg">I&apos;m Lost</div>
          <p className="text-sm text-mute mt-2">
            Paste a moment you got confused. Get an explanation, why it
            matters, and smart replies.
          </p>
          <div className="mt-5 text-accent text-sm group-hover:translate-x-1 transition">
            Fix my confusion -&gt;
          </div>
        </Link>

        <Link href="/listen" className="card p-6 hover:border-accent2/50 transition group">
          <div className="text-3xl">LIVE</div>
          <div className="mt-3 font-semibold text-lg">Listen mode</div>
          <p className="text-sm text-mute mt-2">
            Let ConvoTech listen to your meeting. Notes + tappable questions.
          </p>
          <div className="mt-5 text-accent2 text-sm group-hover:translate-x-1 transition">
            Start listening -&gt;
          </div>
        </Link>

        <Link href="/talk" className="card p-6 hover:border-accent/50 transition group">
          <div className="text-3xl">CHAT</div>
          <div className="mt-3 font-semibold text-lg">Tech Talk</div>
          <p className="text-sm text-mute mt-2">
            A casual chat with a senior dev - seeded with topics from your
            recent journal, or a random hot take.
          </p>
          <div className="mt-5 text-accent text-sm group-hover:translate-x-1 transition">
            Start chatting -&gt;
          </div>
        </Link>

        <Link href="/brief" className="card p-6 hover:border-accent2/50 transition group">
          <div className="text-3xl">NEWS</div>
          <div className="mt-3 font-semibold text-lg">Briefing</div>
          <p className="text-sm text-mute mt-2">
            Daily personalized digest of new models, agents, and approaches -
            filtered for what you&apos;re building.
          </p>
          <div className="mt-5 text-accent2 text-sm group-hover:translate-x-1 transition">
            Read today&apos;s brief -&gt;
          </div>
        </Link>

        <Link href="/eval" className="card p-6 hover:border-accent/50 transition group sm:col-span-2">
          <div className="text-3xl">⚖️ EVAL</div>
          <div className="mt-3 font-semibold text-lg">Model evaluation</div>
          <p className="text-sm text-mute mt-2">
            Compare AI models side-by-side for your project, or have the AI
            suggest 3-4 that fit. Per-model fit verdicts, strengths, weaknesses,
            HIPAA / pricing / license — like Gadget 360 for LLMs.
          </p>
          <div className="mt-5 text-accent text-sm group-hover:translate-x-1 transition">
            Compare models -&gt;
          </div>
        </Link>
      </section>

      <section>
        <JournalTimeline />
      </section>
    </div>
  );
}
