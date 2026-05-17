import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import Timeline from "@/components/Timeline";
import { getBook, getBooks, getEventsForBook } from "@/lib/events";
import { getDerived } from "@/lib/derived";

export async function generateStaticParams() {
  const books = await getBooks();
  return books.map((b) => ({ slug: b.slug }));
}

export default async function BookPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const book = await getBook(slug);
  if (!book) notFound();

  const [events, derived] = await Promise.all([
    getEventsForBook(slug),
    getDerived(),
  ]);

  return (
    <>
      <section
        className="border-b border-rule"
        style={{ borderTopWidth: 4, borderTopColor: book.color }}
      >
        <div className="max-w-7xl mx-auto px-6 py-12">
          <Link
            href="/books"
            className="font-sans text-xs text-ink-soft uppercase tracking-[0.18em] hover:text-accent inline-block mb-3"
          >
            ← All books
          </Link>
          <div className="grid md:grid-cols-[2fr_1fr] gap-10 items-end">
            <div>
              <p
                className="font-sans text-xs uppercase tracking-wider font-semibold mb-2"
                style={{ color: book.color }}
              >
                {book.shortName}
              </p>
              <h2 className="font-serif text-4xl md:text-5xl leading-tight tracking-tight mb-2">
                {book.title}
              </h2>
              {book.subtitle && (
                <p className="font-serif italic text-xl text-ink-soft mb-3">
                  {book.subtitle}
                </p>
              )}
              <p className="font-sans text-sm text-ink-soft">
                by {book.author} &middot; {book.yearPublished}
              </p>
            </div>
            <p className="font-sans text-sm text-ink-soft leading-relaxed">
              {book.description}
              <br />
              <strong className="text-ink">{events.length}</strong> events
              extracted.
            </p>
          </div>
        </div>
      </section>

      <Suspense fallback={null}>
        <Timeline
          events={events}
          books={[book]}
          derived={derived}
          showBookFilter={false}
        />
      </Suspense>
    </>
  );
}
