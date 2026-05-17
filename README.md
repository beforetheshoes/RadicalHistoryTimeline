# Radical History Timeline

An interactive timeline of dated events drawn from books of anarchist, labor, and radical history.

**Live site**: https://beforetheshoes.github.io/RadicalHistoryTimeline/

Each event is anchored to a verbatim quote from its source book with full chapter and page citation. The app offers several views of the same dataset:

- **Horizontal timeline** — every book's events along a shared, non-linearly-scaled calendar
- **Pulse-time map** — a year cursor that lights events where (and when) they happened
- **Vertical cards** — the traditional reading view
- **Tag lenses** — isolate a thread (*The Rise of Fascism*, *Anti-Fascism*, *Kurdish Liberation*) and watch it cross books, decades, and continents. Lens state is URL-shareable.
- **Meanwhile** — every event drawer surfaces what else was unfolding within ±5 years elsewhere in the world.

AI was used to pull events from each book; quotes are verbatim.

## Local development

```bash
npm install
npm run dev        # http://localhost:3000
```

## Build & static export

The site is statically exported and deployed to GitHub Pages on every push to `main`.

```bash
npm run build      # produces out/
```

`prebuild` runs `scripts/build-index.ts`, which mines the storytelling layer:

- normalizes the tag vocabulary
- resolves locations against a hand-curated gazetteer + lat/lon table
- mines tag-anchored, person-thread, and concurrency-year clusters
- renders a static Equal Earth world map (177 country paths)

Outputs land in `public/data/derived/`.

## Project layout

```
app/                       # Next.js routes
components/                # Timeline, EraTimeline, MapView, LensPanel, …
lib/                       # types, lens, storytelling, derived, events
scripts/build-index.ts     # build-time miner
data/                      # authoring inputs (gazetteer, tag aliases, hierarchy)
public/data/               # event JSONs (one per book) + derived/ artifacts
```

## Tech

Next.js 16 (App Router, static export) · React 19 · Tailwind 4 · TypeScript · d3-geo (build-time only).
