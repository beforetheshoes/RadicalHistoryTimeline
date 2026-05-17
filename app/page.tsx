import { Suspense } from "react";
import Link from "next/link";
import Timeline from "@/components/Timeline";
import { getAllEvents, getBooks } from "@/lib/events";
import { getDerived } from "@/lib/derived";

function formatYear(year: number): string {
  if (year < 0) return `${Math.abs(year).toLocaleString()} BCE`;
  return year.toString();
}

export default async function Home() {
  const [events, books, derived] = await Promise.all([
    getAllEvents(),
    getBooks(),
    getDerived(),
  ]);

  const years = events.map((e) => e.date.year);
  const earliest = Math.min(...years);
  const latest = Math.max(...years);

  return (
    <>
      <section className="border-b border-rule">
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <p className="font-sans text-xs text-ink-soft">
            <strong className="text-ink font-serif text-base">
              {events.length.toLocaleString()}
            </strong>{" "}
            events ·{" "}
            <strong className="text-ink font-serif text-base">
              {books.length}
            </strong>{" "}
            books ·{" "}
            <span className="tabular-nums">
              {formatYear(earliest)} → {formatYear(latest)}
            </span>
            {" — "}
            <Link href="/about" className="text-accent hover:underline">
              what is this?
            </Link>
          </p>
          <p className="font-sans text-[11px] text-ink-soft/80">
            Click a tag to filter · drag the map cursor to scrub time · share
            any view by URL
          </p>
        </div>
        <div className="max-w-7xl mx-auto px-6 pb-3">
          <p className="inline-flex items-center gap-1.5 font-sans text-[11px] text-ink-soft border border-rule rounded-full px-2.5 py-1 bg-paper-dark/40">
            <span
              aria-hidden
              className="inline-block w-1.5 h-1.5 rounded-full bg-accent"
            />
            AI was used to pull events from each book and assemble this
            timeline. Quotes are verbatim;{" "}
            <Link href="/about" className="underline hover:text-ink">
              read more
            </Link>
            .
          </p>
        </div>
      </section>

      <Suspense fallback={null}>
        <Timeline events={events} books={books} derived={derived} />
      </Suspense>
    </>
  );
}
