import type { TimelineEvent, Book } from "./types";
import {
  ERAS,
  type Era,
  type EraId,
  computeEraLayout,
  yearToX,
  eraForYear,
} from "./eras";

export type RenderMode = "bar" | "dot" | "tile";

export type LaidEvent = {
  event: TimelineEvent;
  eraId: EraId;
  x: number; // absolute x in the layout coord system
  laneIdx: number; // which book lane (0-indexed)
  stackRow: number; // for dots, which sub-row within the lane (0 or 1)
};

export type LaneLayout = {
  book: Book;
  laneIdx: number;
  /** Render modes per era for this lane. */
  modeByEra: Record<EraId, RenderMode>;
  /** Density buckets per era (one bucket per ~4px column). */
  densityByEra: Record<EraId, number[]>;
  /** Events placed in tile/dot mode (not subsumed into a bar). */
  visibleEvents: LaidEvent[];
};

export type TimelineLayout = {
  totalWidth: number;
  eraLayout: Array<Era & { x: number; width: number }>;
  lanes: LaneLayout[];
  /** Density across all books, per-era, for the scrubber histogram. */
  totalDensityByEra: Record<EraId, number[]>;
};

/**
 * Compute the full layout for the era-timeline view.
 *
 * Rule of thumb: pixels-per-event in an era determines render mode for that lane:
 *   < 2 px/event → density bar
 *   2–40 px/event → stacked dots
 *   > 40 px/event → full tiles
 */
export function computeLayout(
  events: TimelineEvent[],
  books: Book[],
  totalWidth: number,
  focusedEra: EraId | null,
  intraZoom = 1,
): TimelineLayout {
  const eraLayout = computeEraLayout(totalWidth, focusedEra, intraZoom);
  const eraById = Object.fromEntries(eraLayout.map((e) => [e.id, e])) as Record<
    EraId,
    (typeof eraLayout)[number]
  >;

  // Group events by book and by era for mode decisions.
  const bookSlugs = books.map((b) => b.slug);
  const laneIdxBySlug = Object.fromEntries(
    bookSlugs.map((s, i) => [s, i]),
  ) as Record<string, number>;

  // Bucket events: bookSlug → eraId → events[]
  const buckets: Record<string, Record<EraId, TimelineEvent[]>> = {};
  for (const b of bookSlugs) {
    buckets[b] = Object.fromEntries(
      ERAS.map((e) => [e.id, [] as TimelineEvent[]]),
    ) as Record<EraId, TimelineEvent[]>;
  }
  for (const ev of events) {
    if (!buckets[ev.book]) continue;
    const era = eraForYear(ev.date.year);
    buckets[ev.book][era.id].push(ev);
  }

  // Total density per era for the scrubber.
  const totalDensityByEra: Record<EraId, number[]> = Object.fromEntries(
    ERAS.map((e) => {
      const laid = eraById[e.id];
      const buckets = Math.max(1, Math.floor(laid.width / 4));
      return [e.id, new Array<number>(buckets).fill(0)];
    }),
  ) as Record<EraId, number[]>;
  for (const ev of events) {
    const era = eraForYear(ev.date.year);
    const laid = eraById[era.id];
    const span = era.yearEnd - era.yearStart;
    const t = Math.max(0, Math.min(0.999, (ev.date.year - era.yearStart) / span));
    const bucketIdx = Math.floor(t * totalDensityByEra[era.id].length);
    totalDensityByEra[era.id][bucketIdx]++;
  }

  const lanes: LaneLayout[] = books.map((book) => {
    const laneIdx = laneIdxBySlug[book.slug];
    const modeByEra: Record<EraId, RenderMode> = {} as Record<EraId, RenderMode>;
    const densityByEra: Record<EraId, number[]> = {} as Record<EraId, number[]>;
    const visibleEvents: LaidEvent[] = [];

    for (const era of ERAS) {
      const laidEra = eraById[era.id];
      const eraEvents = buckets[book.slug][era.id];
      const n = eraEvents.length;
      const pxPerEvent = n > 0 ? laidEra.width / n : Infinity;

      let mode: RenderMode;
      if (n === 0) mode = "bar"; // empty bar still gets rendered as nothing
      else if (pxPerEvent < 2) mode = "bar";
      else if (pxPerEvent < 100) mode = "dot";
      else mode = "tile";
      modeByEra[era.id] = mode;

      // Density buckets: one bucket per 4px of era width
      const bucketCount = Math.max(1, Math.floor(laidEra.width / 4));
      const laneBuckets = new Array<number>(bucketCount).fill(0);
      const span = era.yearEnd - era.yearStart;

      for (const ev of eraEvents) {
        const t = Math.max(0, Math.min(0.999, (ev.date.year - era.yearStart) / span));
        const bIdx = Math.floor(t * bucketCount);
        laneBuckets[bIdx]++;
      }
      densityByEra[era.id] = laneBuckets;

      // Build LaidEvent records for dot/tile modes
      if (mode === "dot" || mode === "tile") {
        // Sort by year, then resolve x-collisions into stack rows
        const sorted = [...eraEvents].sort((a, b) => {
          if (a.date.year !== b.date.year) return a.date.year - b.date.year;
          return (a.date.month ?? 0) - (b.date.month ?? 0);
        });

        // Stack-row resolution: simple greedy — find first row whose last
        // x is sufficiently to the left of this event's x.
        const rowLastX: number[] = [];
        const minSpacing = mode === "tile" ? 160 : 12;
        for (const ev of sorted) {
          const x = yearToX(ev.date.year, eraLayout);
          let row = 0;
          while (
            row < rowLastX.length &&
            rowLastX[row] + minSpacing > x &&
            row < 4
          ) {
            row++;
          }
          rowLastX[row] = x;
          visibleEvents.push({
            event: ev,
            eraId: era.id,
            x,
            laneIdx,
            stackRow: Math.min(row, 3),
          });
        }
      }
    }

    return { book, laneIdx, modeByEra, densityByEra, visibleEvents };
  });

  return {
    totalWidth,
    eraLayout,
    lanes,
    totalDensityByEra,
  };
}
