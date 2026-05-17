import type { TimelineEvent } from "./types";
import type { Cluster, DerivedIndex } from "./derived";

/**
 * Pure functions over (events, derivedIndex). Memoizable on the client.
 * 4144 events × small constant factors — sub-20ms per call without precomputed
 * adjacency.
 */

/** Canonicalize a raw tag string against the vocabulary alias map. */
export function canonicalTag(raw: string, derived: DerivedIndex): string {
  const lc = raw.toLowerCase().trim();
  return derived.vocab.alias[lc] ?? lc;
}

/** All canonical tags on this event (deduped). */
export function eventTags(ev: TimelineEvent, derived: DerivedIndex): string[] {
  const cans = new Set<string>();
  for (const t of ev.tags ?? []) cans.add(canonicalTag(t, derived));
  return [...cans];
}

/** Region for an event, or undefined if location missing / unresolved. */
export function eventRegion(ev: TimelineEvent, derived: DerivedIndex): string | undefined {
  if (!ev.location) return undefined;
  const g = derived.geo[ev.location];
  if (!g || g._unknown) return undefined;
  return g.region;
}

/**
 * "Meanwhile, elsewhere" — given an event, return up to N events that are
 * temporally close but geographically/sourcedly distinct.
 *
 * Scoring favors:
 *  - temporal proximity (must be within ±maxYearDist)
 *  - different book
 *  - different region
 *  - some shared tags (related context, not duplicate)
 * Penalizes same exact location.
 *
 * After scoring, greedy diversification: each pick downweights events sharing
 * its book+region for subsequent ranking.
 */
export function findConcurrent(
  selected: TimelineEvent,
  allEvents: TimelineEvent[],
  derived: DerivedIndex,
  opts: { limit?: number; maxYearDist?: number } = {},
): TimelineEvent[] {
  const limit = opts.limit ?? 5;
  const maxYearDist = opts.maxYearDist ?? 5;

  const selectedTags = new Set(eventTags(selected, derived));
  const selectedRegion = eventRegion(selected, derived);

  type Scored = { ev: TimelineEvent; score: number; region?: string };
  const scored: Scored[] = [];

  for (const ev of allEvents) {
    if (ev.id === selected.id) continue;
    const yearDist = Math.abs(ev.date.year - selected.date.year);
    if (yearDist > maxYearDist) continue;

    const region = eventRegion(ev, derived);
    const differentBook = ev.book !== selected.book ? 1 : 0;
    const differentRegion = region && selectedRegion && region !== selectedRegion ? 1 : 0;

    let sharedTagCount = 0;
    for (const t of ev.tags ?? []) {
      if (selectedTags.has(canonicalTag(t, derived))) sharedTagCount++;
    }
    const sameLocation = ev.location && selected.location && ev.location === selected.location ? 1 : 0;

    const temporal = 1 / (1 + yearDist);
    const score =
      temporal *
        (1 + 0.5 * differentBook) *
        (1 + 0.5 * differentRegion) *
        (1 + 0.3 * sharedTagCount) -
      0.5 * sameLocation;

    scored.push({ ev, score, region });
  }

  scored.sort((a, b) => b.score - a.score);

  const picked: TimelineEvent[] = [];
  const seenBookRegion = new Map<string, number>();
  for (const s of scored) {
    if (picked.length >= limit) break;
    const key = `${s.ev.book}|${s.region ?? "?"}`;
    const seen = seenBookRegion.get(key) ?? 0;
    // diversify: cap at 1 per (book, region) pair
    if (seen >= 1) continue;
    picked.push(s.ev);
    seenBookRegion.set(key, seen + 1);
  }
  return picked;
}

/**
 * "Related events" — scoring function over the full event array. Used by the
 * lens panel and (in v2) the connection-typed arc legend.
 */
export function findRelated(
  selected: TimelineEvent,
  allEvents: TimelineEvent[],
  derived: DerivedIndex,
  opts: { limit?: number } = {},
): TimelineEvent[] {
  const limit = opts.limit ?? 8;
  const selectedTags = new Set(eventTags(selected, derived));
  const selectedPeople = new Set(selected.people ?? []);
  const selectedRegion = eventRegion(selected, derived);

  // Precompute which clusters the selected event belongs to.
  const inClusters = new Set<string>();
  for (const c of derived.clusters.clusters) {
    if (c.eventIds.includes(selected.id)) inClusters.add(c.id);
  }

  type Scored = { ev: TimelineEvent; score: number };
  const scored: Scored[] = [];
  for (const ev of allEvents) {
    if (ev.id === selected.id) continue;
    let sharedTags = 0;
    for (const t of ev.tags ?? []) {
      if (selectedTags.has(canonicalTag(t, derived))) sharedTags++;
    }
    let sharedPeople = 0;
    for (const p of ev.people ?? []) {
      if (selectedPeople.has(p)) sharedPeople++;
    }
    const region = eventRegion(ev, derived);
    const sameRegion = region && region === selectedRegion ? 1 : 0;
    const sameBook = ev.book === selected.book ? 1 : 0;
    const proximity = 1 / (1 + Math.abs(ev.date.year - selected.date.year) / 10);

    // Cluster overlap
    let sharedClusters = 0;
    for (const c of derived.clusters.clusters) {
      if (inClusters.has(c.id) && c.eventIds.includes(ev.id)) sharedClusters++;
    }

    const score =
      1.5 * sharedTags +
      1.0 * sharedPeople +
      0.8 * sameRegion +
      0.5 * sameBook +
      0.6 * proximity +
      0.4 * sharedClusters;

    if (score > 0) scored.push({ ev, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.ev);
}

/** Clusters containing a given event id. */
export function clustersForEvent(
  eventId: string,
  derived: DerivedIndex,
): Cluster[] {
  return derived.clusters.clusters.filter((c) => c.eventIds.includes(eventId));
}

/** Tag-anchored clusters that include a given canonical tag (as anchor or in expansion). */
export function clustersForTag(tag: string, derived: DerivedIndex): Cluster[] {
  const canon = canonicalTag(tag, derived);
  // First: clusters whose anchorTag is the canonical itself.
  const ids = derived.clusters.byTag[canon] ?? [];
  return derived.clusters.clusters.filter((c) => ids.includes(c.id));
}

/** Build a "concurrent" lens for the moment around a selected event. */
export function buildConcurrentLens(
  selected: TimelineEvent,
  allEvents: TimelineEvent[],
  derived: DerivedIndex,
): {
  id: string;
  label: string;
  eventIds: string[];
  yearRange: [number, number];
  caption: string;
} {
  const window = 5;
  const yearStart = selected.date.year - window;
  const yearEnd = selected.date.year + window;
  const members = allEvents.filter(
    (e) => e.date.year >= yearStart && e.date.year <= yearEnd,
  );
  const books = new Set(members.map((m) => m.book));
  return {
    id: `concurrent:${selected.id}`,
    label: `Around ${formatYear(selected.date.year)}`,
    eventIds: members.map((m) => m.id),
    yearRange: [yearStart, yearEnd],
    caption: `${members.length} events from ${books.size} books happening within ${window} years of ${formatYear(selected.date.year)}.`,
  };
}

function formatYear(year: number): string {
  if (year < 0) return `${Math.abs(year).toLocaleString()} BCE`;
  return year.toString();
}

/** Resolve a lens id to its underlying data (for useLens.resolveLens). */
export function resolveLensById(
  id: string,
  derived: DerivedIndex,
): {
  label: string;
  kind: "cluster" | "tag" | "person" | "concurrent" | "tour";
  eventIds: string[];
  yearRange: [number, number];
  caption?: string;
} | null {
  // tag: lens id like "tag:anti-fascism"
  if (id.startsWith("tag:")) {
    const tag = id.slice(4);
    const clusters = clustersForTag(tag, derived);
    if (clusters.length === 0) return null;
    // Pick the highest-scoring cluster as the lens member set.
    const best = clusters.reduce((a, b) => (a.score > b.score ? a : b));
    return {
      label: best.label,
      kind: "tag",
      eventIds: best.eventIds,
      yearRange: [best.yearStart, best.yearEnd],
      caption: captionFor(best),
    };
  }
  // cluster: lens id like "cluster:tag:anti-fascism" or "cluster:person:..." etc.
  if (id.startsWith("cluster:")) {
    const c = derived.clusters.clusters.find((c) => c.id === id);
    if (!c) return null;
    return {
      label: c.label,
      kind: c.kind === "person-thread" ? "person" : "cluster",
      eventIds: c.eventIds,
      yearRange: [c.yearStart, c.yearEnd],
      caption: captionFor(c),
    };
  }
  return null;
}

function captionFor(c: Cluster): string {
  const range =
    c.yearStart === c.yearEnd
      ? `${formatYear(c.yearStart)}`
      : `${formatYear(c.yearStart)} – ${formatYear(c.yearEnd)}`;
  const bookPart =
    c.books.length > 1 ? `across ${c.books.length} books` : `in 1 book`;
  const regionPart =
    c.regions.length > 1
      ? `, ${c.regions.length} regions`
      : c.regions.length === 1
        ? `, ${c.regions[0]}`
        : "";
  return `${c.eventIds.length} events ${bookPart}${regionPart}, ${range}.`;
}
