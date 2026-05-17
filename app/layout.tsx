import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Radical History Timeline",
  description:
    "An illustrated, searchable timeline of dated events drawn verbatim from anarchist and labor-history books.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col relative">
        <header className="relative z-10 border-b border-rule bg-paper/90 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-6 py-5 flex items-baseline justify-between gap-6">
            <Link href="/" className="block group">
              <h1 className="font-serif text-2xl tracking-tight">
                Radical History Timeline
              </h1>
              <p className="font-sans text-xs text-ink-soft uppercase tracking-[0.18em] mt-1">
                Events drawn from books
              </p>
            </Link>
            <nav className="font-sans text-sm flex items-center gap-6">
              <Link
                href="/"
                className="hover:text-accent transition-colors uppercase tracking-wider"
              >
                Timeline
              </Link>
              <Link
                href="/books"
                className="hover:text-accent transition-colors uppercase tracking-wider"
              >
                Books
              </Link>
              <Link
                href="/about"
                className="hover:text-accent transition-colors uppercase tracking-wider"
              >
                About
              </Link>
            </nav>
          </div>
        </header>
        <main className="relative z-10 flex-1">{children}</main>
        <footer className="relative z-10 border-t border-rule mt-16 py-6 font-sans text-xs text-ink-soft">
          <div className="max-w-7xl mx-auto px-6 flex justify-between">
            <span>All quotes verbatim from cited sources.</span>
            <span>Built locally &middot; no API calls</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
