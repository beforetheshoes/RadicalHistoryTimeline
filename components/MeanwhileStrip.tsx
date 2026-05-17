"use client";

import type { Book, TimelineEvent } from "@/lib/types";
import type { GeoEntry } from "@/lib/derived";

type Props = {
  events: TimelineEvent[];
  booksBySlug: Record<string, Book>;
  geo: Record<string, GeoEntry>;
  selectedYear: number;
  onSelectEvent: (id: string) => void;
};

/**
 * Horizontal strip of "what else was happening" tiles rendered inside the
 * event drawer. Click a tile to swap the drawer to that event; the lens
 * (if any) persists.
 */
export default function MeanwhileStrip({
  events,
  booksBySlug,
  geo,
  selectedYear,
  onSelectEvent,
}: Props) {
  if (events.length === 0) {
    return (
      <p className="font-sans text-xs text-ink-soft/70 italic">
        Nothing else happening within five years.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {events.map((ev) => {
        const book = booksBySlug[ev.book];
        const region = ev.location ? geo[ev.location]?.region : undefined;
        const yearDelta = ev.date.year - selectedYear;
        const yearDeltaStr =
          yearDelta === 0
            ? "same year"
            : yearDelta > 0
              ? `+${yearDelta}y`
              : `${yearDelta}y`;
        return (
          <li key={ev.id}>
            <button
              onClick={() => onSelectEvent(ev.id)}
              className="text-left w-full block bg-paper-dark/30 border border-rule rounded-md px-3 py-2 hover:border-ink-soft hover:bg-paper-dark/60 transition-colors"
              style={{ borderLeftWidth: 3, borderLeftColor: book?.color }}
            >
              <div className="flex items-baseline gap-2 mb-0.5">
                <span
                  className="font-sans text-[10px] uppercase tracking-wider font-semibold"
                  style={{ color: book?.color }}
                >
                  {ev.displayDate}
                </span>
                <span className="font-sans text-[10px] text-ink-soft/70 tabular-nums">
                  {yearDeltaStr}
                </span>
                <span className="font-sans text-[10px] text-ink-soft/80 truncate">
                  {book?.shortName}
                </span>
              </div>
              <p className="font-serif text-sm text-ink leading-snug">{ev.title}</p>
              {(ev.location || region) && (
                <p className="font-sans text-[10px] text-ink-soft mt-1">
                  {ev.location}
                  {region && region !== ev.location && (
                    <span className="opacity-60"> · {region}</span>
                  )}
                </p>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
