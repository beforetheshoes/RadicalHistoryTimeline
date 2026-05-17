/**
 * Build-time miner for the storytelling layer.
 *
 * Reads /public/data/*.events.json and the authoring files in /data/,
 * emits derived artifacts to /public/data/derived/.
 *
 * Run: `npx tsx scripts/build-index.ts` (also runs automatically via `prebuild`).
 */

import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { geoEqualEarth, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import worldTopology from "world-atlas/countries-110m.json";

// Equal Earth projection at a fixed viewport.
// Centered so the map is roughly Europe-aware (most of the dataset is there)
// without breaking other continents.
const MAP_WIDTH = 1000;
const MAP_HEIGHT = 500;
const MAP_PROJECTION = geoEqualEarth().fitSize(
  [MAP_WIDTH, MAP_HEIGHT],
  { type: "Sphere" } as never,
);
const MAP_PATH = geoPath(MAP_PROJECTION);

/** Project lat/lon (in degrees) to SVG (x, y) in the static viewport. */
function projectLatLon(lat: number, lon: number): [number, number] | null {
  const p = MAP_PROJECTION([lon, lat]);
  if (!p || !isFinite(p[0]) || !isFinite(p[1])) return null;
  return [p[0], p[1]];
}

// ---------- types (kept local so the script is self-contained) ----------

type EventDate = {
  year: number;
  month?: number;
  day?: number;
  precision: string;
  rangeEndYear?: number;
};
type Citation = {
  chapter: string;
  chapterIndex: number;
  paragraphIndex: number;
  quote: string;
  page?: number | string;
};
type TimelineEvent = {
  id: string;
  book: string;
  date: EventDate;
  displayDate: string;
  title: string;
  summary: string;
  category?: string;
  location?: string;
  people?: string[];
  tags?: string[];
  citation: Citation;
};
type Book = {
  slug: string;
  title: string;
  author: string;
  color: string;
  shortName: string;
};

type GazEntry = {
  country?: string;
  region: string;
  continent: string;
  lat?: number;
  lon?: number;
  /** Pre-projected SVG x in MAP_WIDTH × MAP_HEIGHT coordinates. */
  x?: number;
  /** Pre-projected SVG y in MAP_WIDTH × MAP_HEIGHT coordinates. */
  y?: number;
};

type TagAliases = Record<string, string[]>;
type TagHierarchy = Record<string, { children?: string[] }>;

type VocabTag = {
  canonical: string;
  aliases: string[];
  count: number;
  bookCounts: Record<string, number>;
  yearMin: number;
  yearMax: number;
  parents: string[];
  cooccur: Array<[string, number]>;
};
type Vocab = {
  tags: Record<string, VocabTag>;
  alias: Record<string, string>;
};

type Geo = Record<string, GazEntry & { _matchedSuffix?: string; _unknown?: boolean }>;

type ClusterKind =
  | "tag-anchored"
  | "person-thread"
  | "geo-temporal"
  | "concurrency-year";

type Cluster = {
  id: string;
  kind: ClusterKind;
  label: string;
  anchorTag?: string;
  anchorPerson?: string;
  yearStart: number;
  yearEnd: number;
  eventIds: string[];
  books: string[];
  regions: string[];
  score: number;
  relatedClusterIds: string[];
};

type EraTheme = {
  eraId: string;
  topTags: Array<{ tag: string; count: number }>;
  topPeople: Array<{ name: string; count: number }>;
  topRegions: Array<{ region: string; count: number }>;
};

// Era definitions duplicated from app/lib/eras.ts so the script doesn't
// depend on the Next.js runtime / aliases.
const ERAS = [
  { id: "paleolithic", yearStart: -300000, yearEnd: -3000 },
  { id: "antiquity", yearStart: -3000, yearEnd: 500 },
  { id: "medieval", yearStart: 500, yearEnd: 1500 },
  { id: "early-modern", yearStart: 1500, yearEnd: 1700 },
  { id: "long-19c", yearStart: 1700, yearEnd: 1900 },
  { id: "20c", yearStart: 1900, yearEnd: 2000 },
  { id: "21c", yearStart: 2000, yearEnd: 2030 },
] as const;

function eraForYear(year: number): string {
  for (const e of ERAS) {
    if (year >= e.yearStart && year < e.yearEnd) return e.id;
  }
  return ERAS[ERAS.length - 1].id;
}

// ---------- paths ----------

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "public", "data");
const AUTHORING_DIR = path.join(ROOT, "data");
const DERIVED_DIR = path.join(DATA_DIR, "derived");

// ---------- io helpers ----------

async function readJson<T>(p: string): Promise<T> {
  return JSON.parse(await fs.readFile(p, "utf-8")) as T;
}
async function readYaml<T>(p: string): Promise<T> {
  try {
    return yaml.load(await fs.readFile(p, "utf-8")) as T;
  } catch {
    return {} as T;
  }
}
async function writeJson(p: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(data, null, 2));
}

// ---------- step 1: load events + books ----------

async function loadAll(): Promise<{
  events: TimelineEvent[];
  books: Book[];
}> {
  const books = await readJson<Book[]>(path.join(DATA_DIR, "books.json"));
  const events: TimelineEvent[] = [];
  for (const b of books) {
    try {
      const arr = await readJson<TimelineEvent[]>(
        path.join(DATA_DIR, `${b.slug}.events.json`),
      );
      events.push(...arr);
    } catch {
      /* skip */
    }
  }
  return { events, books };
}

// ---------- step 2: vocab (tags) ----------

/**
 * Mechanical normalization: lowercase, trim, collapse hyphens, strip a few
 * trailing variant suffixes if the unsuffixed form already exists.
 */
function mechCanonical(raw: string, allRaw: Set<string>): string {
  const t = raw.toLowerCase().trim();
  if (!t) return t;
  // try a few suffix strips against the same set
  const strips = ["s", "es", "ists", "ist", "ism"];
  for (const s of strips) {
    if (t.endsWith(s) && t.length > s.length + 2) {
      const stem = t.slice(0, -s.length);
      if (allRaw.has(stem)) return stem;
    }
  }
  return t;
}

function buildVocab(
  events: TimelineEvent[],
  aliases: TagAliases,
  hierarchy: TagHierarchy,
): Vocab {
  const rawCounts = new Map<string, number>();
  for (const e of events) {
    for (const t of e.tags ?? []) {
      const lc = t.toLowerCase().trim();
      if (!lc) continue;
      rawCounts.set(lc, (rawCounts.get(lc) ?? 0) + 1);
    }
  }
  const allRaw = new Set(rawCounts.keys());

  // alias map: raw → canonical
  const alias: Record<string, string> = {};

  // Apply curated aliases first (highest priority).
  for (const [canonical, list] of Object.entries(aliases)) {
    const can = canonical.toLowerCase();
    alias[can] = can;
    for (const raw of list) {
      alias[raw.toLowerCase()] = can;
    }
  }
  // For all remaining raw tags, apply mechanical normalization.
  for (const raw of rawCounts.keys()) {
    if (alias[raw] !== undefined) continue;
    const mech = mechCanonical(raw, allRaw);
    alias[raw] = alias[mech] ?? mech;
  }

  // Resolve alias → canonical (one level of redirect).
  for (const [raw, can] of Object.entries(alias)) {
    if (alias[can] && alias[can] !== can) {
      alias[raw] = alias[can];
    }
  }

  // Aggregate per-canonical stats.
  const tags: Record<string, VocabTag> = {};
  const cooccur = new Map<string, Map<string, number>>();
  for (const e of events) {
    const canonicals = new Set<string>();
    for (const t of e.tags ?? []) {
      const lc = t.toLowerCase().trim();
      if (!lc) continue;
      canonicals.add(alias[lc] ?? lc);
    }
    for (const c of canonicals) {
      let v = tags[c];
      if (!v) {
        v = tags[c] = {
          canonical: c,
          aliases: [],
          count: 0,
          bookCounts: {},
          yearMin: Number.POSITIVE_INFINITY,
          yearMax: Number.NEGATIVE_INFINITY,
          parents: [],
          cooccur: [],
        };
      }
      v.count++;
      v.bookCounts[e.book] = (v.bookCounts[e.book] ?? 0) + 1;
      v.yearMin = Math.min(v.yearMin, e.date.year);
      v.yearMax = Math.max(v.yearMax, e.date.year);
    }
    // co-occurrence
    const arr = [...canonicals];
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      let m = cooccur.get(a);
      if (!m) cooccur.set(a, (m = new Map<string, number>()));
      for (let j = 0; j < arr.length; j++) {
        if (i === j) continue;
        const b = arr[j];
        m.set(b, (m.get(b) ?? 0) + 1);
      }
    }
  }

  // Record aliases list per canonical.
  for (const [raw, can] of Object.entries(alias)) {
    if (raw === can) continue;
    const v = tags[can];
    if (v && !v.aliases.includes(raw)) v.aliases.push(raw);
  }

  // Hierarchy: assign parents
  for (const [parent, def] of Object.entries(hierarchy)) {
    const pCan = (alias[parent.toLowerCase()] ?? parent.toLowerCase());
    if (!tags[pCan]) {
      // create stub for parent if it has no direct events; harmless
      tags[pCan] = {
        canonical: pCan,
        aliases: [],
        count: 0,
        bookCounts: {},
        yearMin: Number.POSITIVE_INFINITY,
        yearMax: Number.NEGATIVE_INFINITY,
        parents: [],
        cooccur: [],
      };
    }
    for (const child of def.children ?? []) {
      const cCan = alias[child.toLowerCase()] ?? child.toLowerCase();
      const cv = tags[cCan];
      if (cv && !cv.parents.includes(pCan)) cv.parents.push(pCan);
    }
  }

  // Cooccur top-20 per tag (raw counts, no PMI for v1 — counts are clearer).
  for (const [c, m] of cooccur) {
    if (!tags[c]) continue;
    const sorted = [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
    tags[c].cooccur = sorted;
  }

  // Replace ±Infinity for tags with no events (parent stubs).
  for (const v of Object.values(tags)) {
    if (!isFinite(v.yearMin)) v.yearMin = 0;
    if (!isFinite(v.yearMax)) v.yearMax = 0;
  }

  return { tags, alias };
}

// ---------- step 3: geo ----------

const DIRECTIONAL = /^(Northern|Southern|Eastern|Western|North|South|East|West|Central|Upper|Lower|Greater|Old|New)\s+/i;

function tryMatch(
  tok: string,
  gaz: Record<string, GazEntry>,
): (GazEntry & { _matchedSuffix?: string }) | null {
  if (gaz[tok]) return { ...gaz[tok], _matchedSuffix: tok };
  // strip parenthetical
  const noParen = tok.replace(/\s*\(.*?\)\s*/g, "").trim();
  if (noParen !== tok && gaz[noParen])
    return { ...gaz[noParen], _matchedSuffix: noParen };
  // strip directional prefix
  const stripped = tok.replace(DIRECTIONAL, "").trim();
  if (stripped !== tok && gaz[stripped])
    return { ...gaz[stripped], _matchedSuffix: stripped };
  return null;
}

function resolveLocation(
  raw: string,
  gaz: Record<string, GazEntry>,
): GazEntry & { _matchedSuffix?: string; _unknown?: boolean } {
  // Whole-string match first
  const direct = tryMatch(raw, gaz);
  if (direct) return direct;

  // Split on ; and / first (multi-location strings), try each
  const fragments = raw.split(/[;/]/).map((s) => s.trim()).filter(Boolean);
  if (fragments.length > 1) {
    for (const frag of fragments) {
      const r = resolveLocation(frag, gaz);
      if (!r._unknown) return r;
    }
  }

  // Last-comma-token suffix
  const parts = raw.split(",").map((s) => s.trim());
  for (let i = parts.length - 1; i >= 0; i--) {
    const m = tryMatch(parts[i], gaz);
    if (m) return m;
  }
  return { region: "Unknown", continent: "Unknown", _unknown: true };
}

function buildGeo(
  events: TimelineEvent[],
  gaz: Record<string, GazEntry>,
): Geo {
  const out: Geo = {};
  const unknowns = new Map<string, number>();
  for (const e of events) {
    const loc = e.location?.trim();
    if (!loc) continue;
    if (out[loc]) continue;
    const r = resolveLocation(loc, gaz);
    // Project lat/lon → SVG x/y if available.
    if (r.lat !== undefined && r.lon !== undefined) {
      const xy = projectLatLon(r.lat, r.lon);
      if (xy) {
        r.x = round(xy[0]);
        r.y = round(xy[1]);
      }
    }
    out[loc] = r;
    if (r._unknown) unknowns.set(loc, (unknowns.get(loc) ?? 0) + 1);
  }
  return out;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Merge gazetteer-coords.json lat/lon into the main gazetteer by key. */
function mergeCoords(
  gaz: Record<string, GazEntry>,
  coords: Record<string, [number, number] | unknown>,
): void {
  for (const [key, val] of Object.entries(coords)) {
    if (!Array.isArray(val) || val.length !== 2) continue;
    const [lat, lon] = val as [number, number];
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    const existing = gaz[key];
    if (existing) {
      existing.lat = lat;
      existing.lon = lon;
    } else {
      // Bare coord-only entry: assume "Unknown" region (won't be used for
      // region-grouping but pin will still place).
      gaz[key] = {
        region: "Unknown",
        continent: "Unknown",
        lat,
        lon,
      } as GazEntry;
    }
  }
}

/**
 * Generate world-map.json by projecting the world-atlas topology with the same
 * Equal Earth projection used for pins. Output is a list of country SVG paths
 * ready to render as `<path d={...}/>`.
 */
function buildWorldMap(): {
  width: number;
  height: number;
  countries: Array<{ id: string; d: string }>;
  graticule: string;
} {
  // Type-loose: world-atlas TopoJSON ships as JSON — feature() expands it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topo = worldTopology as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fc = feature(topo, topo.objects.countries) as any;
  const countries: Array<{ id: string; d: string }> = [];
  for (const f of fc.features as Array<{ id?: string; properties?: { name?: string } }>) {
    const d = MAP_PATH(f as never);
    if (!d) continue;
    countries.push({
      id: String(f.id ?? f.properties?.name ?? ""),
      d,
    });
  }
  // Sphere outline (the world's "edge")
  const graticule = MAP_PATH({ type: "Sphere" } as never) ?? "";
  return { width: MAP_WIDTH, height: MAP_HEIGHT, countries, graticule };
}

// ---------- step 4: clusters ----------

function descendants(parent: string, hierarchy: TagHierarchy, vocab: Vocab): Set<string> {
  const out = new Set<string>([parent]);
  const stack = [parent];
  while (stack.length) {
    const cur = stack.pop()!;
    const def = hierarchy[cur];
    if (!def?.children) continue;
    for (const c of def.children) {
      const can = vocab.alias[c.toLowerCase()] ?? c.toLowerCase();
      if (!out.has(can)) {
        out.add(can);
        stack.push(can);
      }
    }
  }
  return out;
}

function tagAnchoredClusters(
  events: TimelineEvent[],
  vocab: Vocab,
  hierarchy: TagHierarchy,
  geo: Geo,
): Cluster[] {
  const out: Cluster[] = [];
  const seen = new Set<string>();

  // Index events by canonical tag for speed
  const eventsByTag = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const cans = new Set<string>();
    for (const t of e.tags ?? []) {
      const lc = t.toLowerCase().trim();
      const can = vocab.alias[lc] ?? lc;
      cans.add(can);
    }
    for (const c of cans) {
      let arr = eventsByTag.get(c);
      if (!arr) eventsByTag.set(c, (arr = []));
      arr.push(e);
    }
  }

  // Take every tag with count >= 20, OR any tag named as a hierarchy parent.
  const candidates = new Set<string>();
  for (const [can, v] of Object.entries(vocab.tags)) {
    if (v.count >= 20) candidates.add(can);
  }
  for (const parent of Object.keys(hierarchy)) {
    const can = vocab.alias[parent.toLowerCase()] ?? parent.toLowerCase();
    candidates.add(can);
  }

  for (const anchor of candidates) {
    if (seen.has(anchor)) continue;
    seen.add(anchor);

    const expand = descendants(anchor, hierarchy, vocab);
    const memberSet = new Map<string, TimelineEvent>();
    for (const t of expand) {
      const arr = eventsByTag.get(t);
      if (!arr) continue;
      for (const e of arr) memberSet.set(e.id, e);
    }
    if (memberSet.size < 10) continue;

    const members = [...memberSet.values()].sort((a, b) => {
      if (a.date.year !== b.date.year) return a.date.year - b.date.year;
      return (a.date.month ?? 0) - (b.date.month ?? 0);
    });
    const books = new Set(members.map((m) => m.book));
    const regions = new Set<string>();
    for (const m of members) {
      const g = m.location ? geo[m.location] : undefined;
      if (g && g.region !== "Unknown") regions.add(g.region);
    }
    const yearStart = members[0].date.year;
    const yearEnd = members[members.length - 1].date.year;

    const label = titleize(anchor);
    const score =
      members.length *
      Math.log(2 + (yearEnd - yearStart)) *
      (1 + (books.size - 1) * 0.5);

    out.push({
      id: `cluster:tag:${anchor}`,
      kind: "tag-anchored",
      label,
      anchorTag: anchor,
      yearStart,
      yearEnd,
      eventIds: members.map((m) => m.id),
      books: [...books],
      regions: [...regions],
      score,
      relatedClusterIds: [],
    });
  }

  return out;
}

function personThreadClusters(events: TimelineEvent[], geo: Geo): Cluster[] {
  const byPerson = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    for (const p of e.people ?? []) {
      let arr = byPerson.get(p);
      if (!arr) byPerson.set(p, (arr = []));
      arr.push(e);
    }
  }
  const out: Cluster[] = [];
  for (const [person, arr] of byPerson) {
    if (arr.length < 5) continue;
    const books = new Set(arr.map((e) => e.book));
    if (books.size < 2) continue;
    const sorted = arr.slice().sort((a, b) => a.date.year - b.date.year);
    const regions = new Set<string>();
    for (const m of sorted) {
      const g = m.location ? geo[m.location] : undefined;
      if (g && g.region !== "Unknown") regions.add(g.region);
    }
    out.push({
      id: `cluster:person:${slugify(person)}`,
      kind: "person-thread",
      label: person,
      anchorPerson: person,
      yearStart: sorted[0].date.year,
      yearEnd: sorted[sorted.length - 1].date.year,
      eventIds: sorted.map((e) => e.id),
      books: [...books],
      regions: [...regions],
      score: arr.length * (1 + (books.size - 1) * 0.4),
      relatedClusterIds: [],
    });
  }
  return out;
}

function concurrencyYearClusters(events: TimelineEvent[]): Cluster[] {
  const byYear = new Map<number, TimelineEvent[]>();
  for (const e of events) {
    let arr = byYear.get(e.date.year);
    if (!arr) byYear.set(e.date.year, (arr = []));
    arr.push(e);
  }
  const out: Cluster[] = [];
  for (const [year, arr] of byYear) {
    const books = new Set(arr.map((e) => e.book));
    if (books.size < 4) continue;
    out.push({
      id: `cluster:year:${year}`,
      kind: "concurrency-year",
      label: `Concurrent: ${formatYear(year)}`,
      yearStart: year,
      yearEnd: year,
      eventIds: arr.map((e) => e.id),
      books: [...books],
      regions: [],
      score: arr.length * books.size,
      relatedClusterIds: [],
    });
  }
  return out;
}

// ---------- step 5: era themes ----------

function buildEraThemes(events: TimelineEvent[], vocab: Vocab, geo: Geo): Record<string, EraTheme> {
  const skipTags = new Set(["other", "biography", "politics"]);
  const out: Record<string, EraTheme> = {};
  for (const e of ERAS) {
    const tagCount = new Map<string, number>();
    const personCount = new Map<string, number>();
    const regionCount = new Map<string, number>();
    for (const ev of events) {
      if (eraForYear(ev.date.year) !== e.id) continue;
      const cans = new Set<string>();
      for (const t of ev.tags ?? []) {
        const lc = t.toLowerCase().trim();
        const can = vocab.alias[lc] ?? lc;
        if (skipTags.has(can)) continue;
        cans.add(can);
      }
      for (const c of cans) tagCount.set(c, (tagCount.get(c) ?? 0) + 1);
      for (const p of ev.people ?? []) personCount.set(p, (personCount.get(p) ?? 0) + 1);
      const g = ev.location ? geo[ev.location] : undefined;
      if (g && g.region !== "Unknown") {
        regionCount.set(g.region, (regionCount.get(g.region) ?? 0) + 1);
      }
    }
    out[e.id] = {
      eraId: e.id,
      topTags: topN(tagCount, 6).map(([tag, count]) => ({ tag, count })),
      topPeople: topN(personCount, 5).map(([name, count]) => ({ name, count })),
      topRegions: topN(regionCount, 5).map(([region, count]) => ({ region, count })),
    };
  }
  return out;
}

// ---------- helpers ----------

function topN<K>(m: Map<K, number>, n: number): Array<[K, number]> {
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

const LOWER_WORDS = new Set(["of", "the", "and", "or", "in", "to", "for", "a", "an"]);

function titleize(slug: string): string {
  // Manual overrides for slugs whose natural title isn't a straight per-word capitalize
  const overrides: Record<string, string> = {
    "anti-fascism": "Anti-Fascism",
    "anti-nazi-resistance": "Anti-Nazi Resistance",
    "rise-of-fascism": "The Rise of Fascism",
    "world-war-i": "World War I",
    "world-war-ii": "World War II",
    "vietnam-war": "Vietnam War",
    "cold-war": "Cold War",
    "civil-war": "Civil War",
    "russian-revolution": "Russian Revolution",
    "spanish-civil-war": "Spanish Civil War",
    "anarcho-syndicalism": "Anarcho-Syndicalism",
    "kurdish-liberation": "Kurdish Liberation",
    "labor-movement": "Labor Movement",
    "state-violence": "State Violence",
    "jewish-history": "Jewish History",
    "jewish-life": "Jewish Life",
    "women-liberation": "Women's Liberation",
    "democratic-autonomy": "Democratic Autonomy",
    "general-strike": "General Strike",
    "ypg": "YPG",
    "ypj": "YPJ",
    "pkk": "PKK",
    "cnt": "CNT",
    "fai": "FAI",
    "poum": "POUM",
    "iww": "IWW",
    "bund": "The Bund",
  };
  if (overrides[slug]) return overrides[slug];
  const parts = slug.split("-");
  return parts
    .map((p, i) => {
      if (i > 0 && LOWER_WORDS.has(p)) return p;
      if (p.length <= 3 && /^[a-z]+$/.test(p) && !LOWER_WORDS.has(p))
        return p.toUpperCase();
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join(" ");
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatYear(year: number): string {
  if (year < 0) return `${Math.abs(year).toLocaleString()} BCE`;
  return year.toString();
}

// ---------- main ----------

async function main() {
  console.log("[build-index] reading source data…");
  const { events, books } = await loadAll();
  console.log(`  events: ${events.length}, books: ${books.length}`);

  const aliases = await readYaml<TagAliases>(
    path.join(AUTHORING_DIR, "tag-aliases.yaml"),
  );
  const hierarchy = await readYaml<TagHierarchy>(
    path.join(AUTHORING_DIR, "tag-hierarchy.yaml"),
  );
  const gaz = await readJson<Record<string, GazEntry>>(
    path.join(AUTHORING_DIR, "gazetteer.json"),
  );
  const coords = await readJson<Record<string, [number, number]>>(
    path.join(AUTHORING_DIR, "gazetteer-coords.json"),
  );
  mergeCoords(gaz, coords);

  console.log("[build-index] building vocab…");
  const vocab = buildVocab(events, aliases, hierarchy);
  const canonCount = Object.keys(vocab.tags).length;
  const aliasCount = Object.keys(vocab.alias).length;
  console.log(`  canonical tags: ${canonCount}, alias rows: ${aliasCount}`);

  console.log("[build-index] resolving geography…");
  const geo = buildGeo(events, gaz);
  const unknowns = Object.entries(geo).filter(([, g]) => g._unknown);
  const totalLocations = Object.keys(geo).length;
  const withCoords = Object.values(geo).filter(
    (g) => g.x !== undefined && g.y !== undefined,
  ).length;
  console.log(
    `  distinct locations: ${totalLocations}, unresolved: ${unknowns.length} (${((unknowns.length / Math.max(1, totalLocations)) * 100).toFixed(1)}%), with map coords: ${withCoords} (${((withCoords / Math.max(1, totalLocations)) * 100).toFixed(1)}%)`,
  );
  // Event-level coord coverage (more meaningful than distinct-location coverage)
  let eventsWithCoords = 0;
  let eventsWithLocation = 0;
  for (const e of events) {
    if (!e.location) continue;
    eventsWithLocation++;
    const g = geo[e.location];
    if (g && g.x !== undefined) eventsWithCoords++;
  }
  console.log(
    `  events with location: ${eventsWithLocation}, with map coords: ${eventsWithCoords} (${((eventsWithCoords / Math.max(1, eventsWithLocation)) * 100).toFixed(1)}%)`,
  );
  if (unknowns.length > 0) {
    const sample = unknowns.slice(0, 12).map(([loc]) => loc).join(", ");
    console.log(`  unresolved sample: ${sample}`);
  }

  console.log("[build-index] mining clusters…");
  const tagClusters = tagAnchoredClusters(events, vocab, hierarchy, geo);
  const personClusters = personThreadClusters(events, geo);
  const concurrencyClusters = concurrencyYearClusters(events);
  const allClusters = [...tagClusters, ...personClusters, ...concurrencyClusters].sort(
    (a, b) => b.score - a.score,
  );

  // byTag lookup: tag → [clusterIds]
  const byTag: Record<string, string[]> = {};
  for (const c of allClusters) {
    if (c.kind !== "tag-anchored" || !c.anchorTag) continue;
    (byTag[c.anchorTag] ??= []).push(c.id);
  }

  console.log(
    `  clusters: ${allClusters.length} ` +
      `(tag-anchored=${tagClusters.length}, person-thread=${personClusters.length}, concurrency=${concurrencyClusters.length})`,
  );
  console.log("  top 10 clusters by score:");
  for (const c of allClusters.slice(0, 10)) {
    console.log(
      `    [${c.score.toFixed(0).padStart(7)}] ${c.kind.padEnd(15)} ${c.label} (${c.eventIds.length} events, ${c.books.length} books, ${c.yearStart}–${c.yearEnd})`,
    );
  }

  console.log("[build-index] building era themes…");
  const eraThemes = buildEraThemes(events, vocab, geo);

  console.log("[build-index] building world map…");
  const worldMap = buildWorldMap();
  console.log(
    `  countries: ${worldMap.countries.length} (${MAP_WIDTH}×${MAP_HEIGHT})`,
  );

  // ---------- emit ----------
  console.log("[build-index] writing derived artifacts…");
  await writeJson(path.join(DERIVED_DIR, "vocab.json"), vocab);
  await writeJson(path.join(DERIVED_DIR, "geo.json"), geo);
  await writeJson(path.join(DERIVED_DIR, "clusters.json"), {
    clusters: allClusters,
    byTag,
  });
  await writeJson(path.join(DERIVED_DIR, "era-themes.json"), eraThemes);
  await writeJson(path.join(DERIVED_DIR, "world-map.json"), worldMap);

  // ---------- assertions ----------
  console.log("[build-index] running invariants…");

  const failures: string[] = [];

  // anti-fascism vocab presence across multiple books
  const af = vocab.tags["anti-fascism"];
  if (!af) failures.push("vocab.tags['anti-fascism'] missing");
  else {
    const expected = ["bookchin", "orwell", "goldman", "crabapple", "guerin"];
    const hits = expected.filter((b) => (af.bookCounts[b] ?? 0) > 0);
    if (hits.length < 3) {
      failures.push(
        `anti-fascism appears in only ${hits.length} of expected books (${hits.join(",")}); expected ≥3`,
      );
    }
  }

  // alias normalization
  if (vocab.alias["antifascism"] !== "anti-fascism") {
    failures.push(`alias['antifascism'] = ${vocab.alias["antifascism"]} (expected 'anti-fascism')`);
  }

  // a 1936 concurrency cluster
  const c1936 = allClusters.find((c) => c.id === "cluster:year:1936");
  if (!c1936) failures.push("concurrency-year cluster for 1936 missing");
  else if (c1936.books.length < 4)
    failures.push(`1936 concurrency cluster has only ${c1936.books.length} books; expected ≥4`);

  // rise-of-fascism / anti-fascism tag-anchored cluster spans 1920–1945 with ≥30 events
  const afCluster = allClusters.find(
    (c) => c.kind === "tag-anchored" && c.anchorTag === "anti-fascism",
  );
  if (!afCluster) failures.push("tag-anchored cluster for anti-fascism missing");
  else {
    if (afCluster.eventIds.length < 30)
      failures.push(
        `anti-fascism cluster has only ${afCluster.eventIds.length} events; expected ≥30`,
      );
    if (!(afCluster.yearStart <= 1920 && afCluster.yearEnd >= 1945))
      failures.push(
        `anti-fascism cluster range ${afCluster.yearStart}–${afCluster.yearEnd} does not span 1920–1945`,
      );
  }

  // unknown geo coverage ≤ 10% (relaxed from 5% for v1 — gazetteer iterates)
  const unknownPct = (unknowns.length / Math.max(1, totalLocations)) * 100;
  if (unknownPct > 10) {
    failures.push(`${unknownPct.toFixed(1)}% of locations unresolved (limit 10%)`);
  }

  // Event-level map-coord coverage ≥ 80% — needed for the map view to feel populated
  const coordEventPct =
    (eventsWithCoords / Math.max(1, eventsWithLocation)) * 100;
  if (coordEventPct < 80) {
    failures.push(
      `only ${coordEventPct.toFixed(1)}% of located events have map coordinates (minimum 80%)`,
    );
  }

  if (failures.length > 0) {
    console.error("\n[build-index] INVARIANT FAILURES:");
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log("[build-index] all invariants passed ✓");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
