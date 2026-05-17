import Link from "next/link"
import { getAllEvents, getBooks } from "@/lib/events"

export const metadata = {
  title: "About · Radical History Timeline",
  description:
    "About this project - an experiment in surfacing radical history through multiple views."
}

export default async function AboutPage() {
  const [events, books] = await Promise.all([getAllEvents(), getBooks()])
  return (
    <article className="max-w-3xl mx-auto px-6 py-16">
      <p className="font-sans text-xs text-ink-soft uppercase tracking-[0.18em] mb-3">
        About this project
      </p>
      <h1 className="font-serif text-4xl md:text-5xl leading-tight tracking-tight mb-8">
        An experiment in radical history,
        <br />
        seen from several angles at once.
      </h1>

      <div className="font-serif text-lg text-ink leading-relaxed space-y-5">
        <p>
          The Radical History Timeline is a work in progress. It{" "}
          <strong>uses AI </strong>
          to pull <strong>
            {events.length.toLocaleString()} dated events
          </strong>{" "}
          from <strong>{books.length} books</strong> (these numbers will change
          as more books are added) - works of anarchist, labor, and radical
          history - and attempts to arrange them so the threads connecting them
          become visible.
        </p>

        <p>
          A single event in a history book is a sentence. A thousand events on a
          page is a wall of dates. The point of this project is to find shapes
          in between: to see how an uprising in Andalusia in 1933 was concurrent
          with the Bund organizing in Warsaw and with anti-fascist militias
          forming in Berlin - and how their isolation from each other shaped
          what came next.
        </p>

        <p>
          To do that, the timeline experiments with several views of the same
          dataset:
        </p>
      </div>

      <ul className="font-serif text-base text-ink leading-relaxed mt-6 space-y-3">
        <li>
          <strong>The horizontal timeline </strong> lays every book&apos;s
          events along the same calendar, scaled non-linearly so the
          densely-documented modern eras get the room they need.
        </li>
        <li>
          <strong>The map</strong> turns time into a cursor you can drag or
          play. Events pulse where they happened, when they happened. Press play
          and watch events unfurl across continents.
        </li>
        <li>
          <strong>The vertical view</strong> is the traditional one: cards,
          decade headings, alternating columns. Useful for slow reading.
        </li>
        <li>
          <strong>Tag lenses </strong> let you isolate a thread - &ldquo;The
          Rise of Fascism,&rdquo; &ldquo;Anti-Fascism,&rdquo; &ldquo;Kurdish
          Liberation&rdquo; - and watch it cross books, decades, and continents.
          The lens URL is shareable.
        </li>
        <li>
          <strong>Meanwhile</strong>, inside every event drawer, surfaces what
          else was happening within ±5 years elsewhere in the world. Sometimes
          the loudest thing about an event is the silence around it.
        </li>
      </ul>

      <div className="font-serif text-lg text-ink leading-relaxed mt-8 space-y-5">
        <p>
          Every event is anchored to a verbatim quote from its source book, with
          chapter and page citation. Nothing is paraphrased. Where stories
          emerge, they emerge from the arrangement of facts the authors
          themselves wrote down.
        </p>

        <p>
          This is a personal experiment, still being shaped. New books, lenses,
          and views are being added. Errors and rough edges are expected - if
          you spot one, the data is open.
        </p>
      </div>

      <hr className="border-rule my-12" />

      <div className="font-sans text-sm text-ink-soft">
        <p>
          Start exploring on the{" "}
          <Link href="/" className="text-accent hover:underline">
            timeline
          </Link>{" "}
          or browse the{" "}
          <Link href="/books" className="text-accent hover:underline">
            source books
          </Link>
          .
        </p>
      </div>
    </article>
  )
}
