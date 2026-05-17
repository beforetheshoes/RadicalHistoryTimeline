import fs from "node:fs/promises";
import path from "node:path";

export type VocabTag = {
  canonical: string;
  aliases: string[];
  count: number;
  bookCounts: Record<string, number>;
  yearMin: number;
  yearMax: number;
  parents: string[];
  cooccur: Array<[string, number]>;
};

export type Vocab = {
  tags: Record<string, VocabTag>;
  alias: Record<string, string>;
};

export type GeoEntry = {
  country?: string;
  region: string;
  continent: string;
  lat?: number;
  lon?: number;
  /** Pre-projected SVG x in the map viewport. */
  x?: number;
  /** Pre-projected SVG y in the map viewport. */
  y?: number;
  _matchedSuffix?: string;
  _unknown?: boolean;
};

export type Geo = Record<string, GeoEntry>;

export type ClusterKind =
  | "tag-anchored"
  | "person-thread"
  | "geo-temporal"
  | "concurrency-year";

export type Cluster = {
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

export type Clusters = {
  clusters: Cluster[];
  byTag: Record<string, string[]>;
};

export type EraTheme = {
  eraId: string;
  topTags: Array<{ tag: string; count: number }>;
  topPeople: Array<{ name: string; count: number }>;
  topRegions: Array<{ region: string; count: number }>;
};

export type EraThemes = Record<string, EraTheme>;

export type WorldMap = {
  width: number;
  height: number;
  countries: Array<{ id: string; d: string }>;
  graticule: string;
};

export type DerivedIndex = {
  vocab: Vocab;
  geo: Geo;
  clusters: Clusters;
  eraThemes: EraThemes;
  worldMap: WorldMap;
};

const DERIVED_DIR = path.join(process.cwd(), "public", "data", "derived");

async function readJson<T>(file: string): Promise<T> {
  const raw = await fs.readFile(path.join(DERIVED_DIR, file), "utf-8");
  return JSON.parse(raw) as T;
}

export async function getDerived(): Promise<DerivedIndex> {
  const [vocab, geo, clusters, eraThemes, worldMap] = await Promise.all([
    readJson<Vocab>("vocab.json"),
    readJson<Geo>("geo.json"),
    readJson<Clusters>("clusters.json"),
    readJson<EraThemes>("era-themes.json"),
    readJson<WorldMap>("world-map.json"),
  ]);
  return { vocab, geo, clusters, eraThemes, worldMap };
}
