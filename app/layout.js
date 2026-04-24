import "./globals.css";

export const metadata = {
  title: "ConvoTech - learn tech by talking",
  description:
    "Drop in a moment you got lost, get clarity + what to say back. Then jump into daily casual tech conversations.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen max-w-3xl mx-auto px-4 py-6">
          <header className="flex items-center justify-between mb-8">
            <a href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent2 grid place-items-center text-sm font-bold">
                C
              </div>
              <div>
                <div className="font-semibold leading-none">ConvoTech</div>
                <div className="text-xs text-mute leading-none mt-1">
                  learn tech by talking
                </div>
              </div>
            </a>
            <nav className="text-sm text-mute flex gap-4">
              <a href="/lost" className="hover:text-ink">I&apos;m Lost</a>
              <a href="/listen" className="hover:text-ink">Listen</a>
              <a href="/talk" className="hover:text-ink">Tech Talk</a>
              <a href="/brief" className="hover:text-ink">Briefing</a>
            </nav>
          </header>
          <main>{children}</main>
          <footer className="mt-16 text-xs text-mute text-center">
            Built for real-world tech awareness. No courses. Just conversation.
          </footer>
        </div>
      </body>
    </html>
  );
}
