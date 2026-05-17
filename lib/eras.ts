/**
 * Era model — partitions all of recorded human history into named bands.
 * Each era takes a fixed percentage of the timeline width regardless of
 * its calendar duration. Within an era, time is linear. Era boundaries
 * are visible gutter gaps, not continuous.
 *
 * The widths are calibrated so 1700+ gets ~78% of total horizontal space,
 * which matches the dataset density.
 */

export type EraId =
  | "paleolithic"
  | "antiquity"
  | "medieval"
  | "early-modern"
  | "long-19c"
  | "20c"
  | "21c";

export type Era = {
  id: EraId;
  name: string;
  shortName: string;
  yearStart: number;
  yearEnd: number;
  widthPct: number;
};

export const ERAS: Era[] = [
  {
    id: "paleolithic",
    name: "Paleolithic & Prehistory",
    shortName: "Prehistory",
    yearStart: -300000,
    yearEnd: -3000,
    widthPct: 6,
  },
  {
    id: "antiquity",
    name: "Antiquity",
    shortName: "Antiquity",
    yearStart: -3000,
    yearEnd: 500,
    widthPct: 6,
  },
  {
    id: "medieval",
    name: "Medieval",
    shortName: "Medieval",
    yearStart: 500,
    yearEnd: 1500,
    widthPct: 5,
  },
  {
    id: "early-modern",
    name: "Early Modern",
    shortName: "Early Modern",
    yearStart: 1500,
    yearEnd: 1700,
    widthPct: 5,
  },
  {
    id: "long-19c",
    name: "The Long 19th Century",
    shortName: "19th c.",
    yearStart: 1700,
    yearEnd: 1900,
    widthPct: 18,
  },
  {
    id: "20c",
    name: "The 20th Century",
    shortName: "20th c.",
    yearStart: 1900,
    yearEnd: 2000,
    widthPct: 35,
  },
  {
    id: "21c",
    name: "The 21st Century",
    shortName: "21st c.",
    yearStart: 2000,
    yearEnd: 2030,
    widthPct: 25,
  },
];

/** Format a year for display: 429 → "429 CE", -429 → "429 BCE". */
export function formatYear(year: number): string {
  if (year < 0) return `${Math.abs(year).toLocaleString()} BCE`;
  return year.toString();
}

/** Format a year compactly (without "CE" suffix for positive years). */
export function formatYearCompact(year: number): string {
  if (year < 0) return `${Math.abs(year).toLocaleString()} BCE`;
  return year.toString();
}

/** Which era does this year belong to? */
export function eraForYear(year: number): Era {
  for (const era of ERAS) {
    if (year >= era.yearStart && year < era.yearEnd) return era;
  }
  // Past the end — bucket into the last era.
  return ERAS[ERAS.length - 1];
}

/**
 * Compute the cumulative x offset (in pixels) of an era's left edge,
 * given the total available width and an optional focused-era expansion.
 *
 * When `focusedEra` is null, every era takes its base widthPct of `totalWidth`
 * (minus gutters).
 *
 * When `focusedEra` is set, the focused era expands to `focusedPct`% of the
 * usable width, and the non-focused eras share the remainder, *each in
 * proportion to their original widthPct*.
 */
export function computeEraLayout(
  totalWidth: number,
  focusedEra: EraId | null,
  intraZoom = 1,
  focusedPct = 75,
  gutterPx = 8,
): Array<Era & { x: number; width: number }> {
  const gutters = (ERAS.length - 1) * gutterPx;
  const usableWidth = totalWidth - gutters;

  let widths: number[];
  if (focusedEra === null) {
    // No focus: distribute by widthPct.
    const totalPct = ERAS.reduce((s, e) => s + e.widthPct, 0);
    widths = ERAS.map((e) => (e.widthPct / totalPct) * usableWidth);
  } else {
    // One focused era takes focusedPct of the viewport at intraZoom=1.
    // intraZoom > 1 multiplies the focused era's width (SVG scrolls horizontally).
    // Non-focused eras stay sized to fit the remaining viewport space at zoom=1
    // (they don't change with intraZoom, so the rails are stable).
    const others = ERAS.filter((e) => e.id !== focusedEra);
    const baseFocusedWidth = (focusedPct / 100) * usableWidth;
    const focusedWidth = baseFocusedWidth * intraZoom;
    const remaining = usableWidth - baseFocusedWidth;
    const remainingPctTotal = others.reduce((s, e) => s + e.widthPct, 0);
    widths = ERAS.map((e) =>
      e.id === focusedEra
        ? focusedWidth
        : (e.widthPct / remainingPctTotal) * remaining,
    );
  }

  let x = 0;
  return ERAS.map((era, i) => {
    const w = widths[i];
    const out = { ...era, x, width: w };
    x += w + gutterPx;
    return out;
  });
}

/**
 * Project a year to its x-coordinate within the era layout.
 * Returns the absolute x in pixels in the layout coordinate system.
 */
export function yearToX(
  year: number,
  eraLayout: Array<Era & { x: number; width: number }>,
): number {
  const era = eraForYear(year);
  const laid = eraLayout.find((e) => e.id === era.id);
  if (!laid) return 0;
  const span = era.yearEnd - era.yearStart;
  const t = Math.max(0, Math.min(1, (year - era.yearStart) / span));
  return laid.x + t * laid.width;
}
