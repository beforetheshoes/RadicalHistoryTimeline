"use client";

import type { Lens } from "@/lib/lens";

type Props = {
  lens: Lens;
  totalEvents: number;
  onClear: () => void;
  /** Number of currently-visible (filtered) events that belong to this lens. */
  visibleInLens: number;
};

/**
 * Persistent slim panel that hangs from the top-left of the timeline body
 * whenever a lens is active. It's not modal — the timeline remains fully
 * interactive behind it. Coexists with the right-side event drawer.
 */
export default function LensPanel({ lens, totalEvents, onClear, visibleInLens }: Props) {
  return (
    <div
      className="font-sans text-xs flex items-stretch border border-rule rounded-md overflow-hidden bg-paper shadow-sm"
      style={{ borderLeftWidth: 3, borderLeftColor: lens.accent }}
    >
      {/* Accent stripe with kind label */}
      <div
        className="flex items-center px-2.5 text-paper uppercase tracking-[0.14em] text-[10px] font-semibold"
        style={{ backgroundColor: lens.accent }}
      >
        Lens
      </div>

      <div className="flex flex-col px-3 py-1.5 min-w-0">
        <span
          className="font-serif text-sm text-ink leading-tight truncate max-w-[28rem]"
          title={lens.label}
        >
          {lens.label}
        </span>
        <span className="text-[10px] text-ink-soft mt-0.5">
          {lens.eventIds.size.toLocaleString()} events
          {visibleInLens !== lens.eventIds.size && (
            <>
              {" "}
              · <span className="opacity-80">{visibleInLens} visible</span>
            </>
          )}
          {" · "}
          {formatYearRange(lens.yearRange)}
        </span>
        {lens.caption && (
          <span className="text-[10px] text-ink-soft/80 mt-1 max-w-[28rem] leading-snug">
            {lens.caption}
          </span>
        )}
      </div>

      <button
        onClick={onClear}
        className="px-2.5 border-l border-rule hover:bg-paper-dark/40 text-ink-soft hover:text-ink"
        title="Clear lens (Esc)"
        aria-label="Clear lens"
      >
        ✕
      </button>

      <span className="hidden" aria-hidden>
        {totalEvents}
      </span>
    </div>
  );
}

function formatYearRange([a, b]: [number, number]): string {
  const f = (y: number) =>
    y < 0 ? `${Math.abs(y).toLocaleString()} BCE` : y.toString();
  if (a === b) return f(a);
  return `${f(a)} → ${f(b)}`;
}
