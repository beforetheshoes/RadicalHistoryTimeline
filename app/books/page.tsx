import Link from "next/link";
import { getBooks, getEventsForBook } from "@/lib/events";

export default async function BooksPage() {
  const books = await getBooks();
  const counts = await Promise.all(
    books.map(async (b) => ({
      slug: b.slug,
      count: (await getEventsForBook(b.slug)).length,
    })),
  );
  const countBySlug = Object.fromEntries(counts.map((c) => [c.slug, c.count]));

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <p className="font-sans text-xs text-ink-soft uppercase tracking-[0.18em] mb-3">
        Sources
      </p>
      <h2 className="font-serif text-4xl md:text-5xl leading-tight tracking-tight mb-10">
        Books in the collection
      </h2>

      <ul className="grid md:grid-cols-2 gap-8">
        {books.map((b) => (
          <li
            key={b.slug}
            className="bg-paper-dark/30 border border-rule rounded-lg p-6 relative overflow-hidden"
            style={{ borderTopWidth: 4, borderTopColor: b.color }}
          >
            <p
              className="font-sans text-xs uppercase tracking-wider font-semibold mb-2"
              style={{ color: b.color }}
            >
              {b.shortName} &middot; {b.yearPublished}
            </p>
            <h3 className="font-serif text-2xl leading-tight mb-1">{b.title}</h3>
            {b.subtitle && (
              <p className="font-serif italic text-ink-soft mb-2">
                {b.subtitle}
              </p>
            )}
            <p className="font-sans text-sm text-ink-soft mb-4">by {b.author}</p>
            <p className="font-sans text-sm leading-relaxed mb-6">
              {b.description}
            </p>
            <div className="flex items-center justify-between font-sans text-sm">
              <span className="text-ink-soft">
                <strong className="text-ink">{countBySlug[b.slug] ?? 0}</strong>{" "}
                events extracted
              </span>
              <Link
                href={`/books/${b.slug}`}
                className="text-accent hover:underline"
              >
                View timeline →
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
