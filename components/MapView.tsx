"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Book, TimelineEvent } from "@/lib/types";
import type { DerivedIndex } from "@/lib/derived";
import type { Lens } from "@/lib/lens";

type Props = {
  events: TimelineEvent[];
  books: Book[];
  derived: DerivedIndex;
  lens: Lens | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

/**
 * "Pulse-time" map: a year cursor drives what's visible. Events near the
 * cursor pulse at full intensity; events further away fade. Press play and
 * history breathes across the world.
 *
 * Design rules carried over:
 *  - Dim, never hide (non-lens events stay at ~10% opacity).
 *  - Paper-tone aesthetic — borders hairline-dashed, no glow.
 *  - One animation primitive (a single rAF loop).
 */
export default function MapView({
  events,
  books,
  derived,
  lens,
  selectedId,
  onSelect,
}: Props) {
  const bookBySlug = useMemo(
    () => Object.fromEntries(books.map((b) => [b.slug, b])),
    [books],
  );

  // Geocode events once. Drop events without map coordinates.
  const pins = useMemo(() => {
    const out: Array<{
      ev: TimelineEvent;
      x: number;
      y: number;
      color: string;
    }> = [];
    for (const e of events) {
      if (!e.location) continue;
      const g = derived.geo[e.location];
      if (!g || g.x === undefined || g.y === undefined) continue;
      const book = bookBySlug[e.book];
      out.push({ ev: e, x: g.x, y: g.y, color: book?.color ?? "#444" });
    }
    return out;
  }, [events, derived.geo, bookBySlug]);

  // The year cursor — modeled as a continuous number so animation can
  // interpolate smoothly between integer years.
  const yearMin = useMemo(
    () => Math.min(...pins.map((p) => p.ev.date.year)),
    [pins],
  );
  const yearMax = useMemo(
    () => Math.max(...pins.map((p) => p.ev.date.year)),
    [pins],
  );

  // Default: jump to the lens year-range center if a lens is active, else
  // the modern era (1900) which is where most events live.
  const initialYear = useMemo(() => {
    if (lens) {
      return Math.round((lens.yearRange[0] + lens.yearRange[1]) / 2);
    }
    return 1900;
  }, [lens]);

  const [cursorYear, setCursorYear] = useState<number>(initialYear);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(5); // years per second
  const cursorRef = useRef(cursorYear);
  cursorRef.current = cursorYear;

  // When lens changes, snap the cursor into its range.
  useEffect(() => {
    if (!lens) return;
    const [a, b] = lens.yearRange;
    if (cursorRef.current < a || cursorRef.current > b) {
      setCursorYear(Math.round((a + b) / 2));
    }
    // intentional: respond to lens id changes only, not cursor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lens?.id]);

  // When selection changes, snap cursor to the selected event's year so
  // the user can see where it is on the map.
  useEffect(() => {
    if (!selectedId) return;
    const sel = pins.find((p) => p.ev.id === selectedId);
    if (!sel) return;
    setCursorYear(sel.ev.date.year);
    setPlaying(false);
  }, [selectedId, pins]);

  // rAF loop for playback. Single primitive — no setInterval, no setTimeout.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const max = lens ? lens.yearRange[1] : yearMax;
    const min = lens ? lens.yearRange[0] : yearMin;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      let next = cursorRef.current + speed * dt;
      if (next > max) {
        next = min; // wrap so play can run forever
      }
      setCursorYear(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, lens, yearMin, yearMax]);

  // Pulse function: distance in years → opacity multiplier.
  // Within ±2y: full. Linearly fades to 0 at ±12y. Sharper falloff than the
  // dim factor so the cursor really "lights up" the moment.
  function pulseOpacity(distYears: number): number {
    const d = Math.abs(distYears);
    if (d <= 2) return 1;
    if (d >= 12) return 0;
    return 1 - (d - 2) / 10;
  }

  // Click-to-set-cursor on the scrubber rail.
  const scrubRef = useRef<HTMLDivElement>(null);
  const onScrubClick = useCallback(
    (e: React.MouseEvent) => {
      const el = scrubRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const t = (e.clientX - r.left) / r.width;
      const min = lens ? lens.yearRange[0] : yearMin;
      const max = lens ? lens.yearRange[1] : yearMax;
      setCursorYear(min + Math.max(0, Math.min(1, t)) * (max - min));
    },
    [lens, yearMin, yearMax],
  );

  const cursorMin = lens ? lens.yearRange[0] : yearMin;
  const cursorMax = lens ? lens.yearRange[1] : yearMax;
  const cursorT = (cursorYear - cursorMin) / Math.max(1, cursorMax - cursorMin);

  // Density along the cursor track — same idea as the era scrubber, but
  // mapped linearly across the cursor range.
  const trackHistogram = useMemo(() => {
    const N = 200;
    const buckets = new Array<number>(N).fill(0);
    const min = cursorMin;
    const max = cursorMax;
    const span = Math.max(1, max - min);
    for (const p of pins) {
      if (lens && !lens.eventIds.has(p.ev.id)) continue;
      const t = (p.ev.date.year - min) / span;
      if (t < 0 || t > 1) continue;
      const i = Math.min(N - 1, Math.floor(t * N));
      buckets[i]++;
    }
    return buckets;
  }, [pins, cursorMin, cursorMax, lens]);
  const trackMax = Math.max(1, ...trackHistogram);

  const { width: W, height: H } = derived.worldMap;

  const inLens = useCallback(
    (id: string) => !lens || lens.eventIds.has(id),
    [lens],
  );

  return (
    <div className="w-full max-w-7xl mx-auto">
      {/* Map */}
      <div className="bg-paper border border-rule rounded-lg overflow-hidden">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          preserveAspectRatio="xMidYMid meet"
          style={{ display: "block", aspectRatio: `${W} / ${H}` }}
        >
          {/* Ocean: the sphere outline */}
          <path
            d={derived.worldMap.graticule}
            fill="var(--paper)"
            stroke="var(--rule)"
            strokeWidth={0.6}
          />

          {/* Countries: hairline dashed borders, faint fill */}
          <g>
            {derived.worldMap.countries.map((c) => (
              <path
                key={c.id}
                d={c.d}
                fill="var(--paper-dark)"
                fillOpacity={0.35}
                stroke="var(--ink-soft)"
                strokeOpacity={0.35}
                strokeWidth={0.5}
              />
            ))}
          </g>

          {/* Pins */}
          <g>
            {pins.map((p) => {
              const dist = p.ev.date.year - cursorYear;
              const pulse = pulseOpacity(dist);
              const lensOk = inLens(p.ev.id);
              const baseDim = lensOk ? 1 : 0.1;
              const opacity = pulse * baseDim;
              const isSelected = selectedId === p.ev.id;
              if (opacity < 0.02 && !isSelected) return null;
              const r = isSelected ? 4.5 : 2.4 + pulse * 1.2;
              return (
                <g
                  key={p.ev.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => onSelect(p.ev.id)}
                >
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={r}
                    fill={p.color}
                    fillOpacity={opacity}
                    stroke={isSelected ? "var(--accent)" : "var(--paper)"}
                    strokeWidth={isSelected ? 1.2 : 0.6}
                  />
                  <title>{`${p.ev.displayDate} — ${p.ev.title}\n${p.ev.location ?? ""}`}</title>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Year scrubber + controls */}
      <div className="mt-4 px-4 py-3 bg-paper border border-rule rounded-lg">
        <div className="flex items-center justify-between gap-3 mb-2 font-sans text-xs text-ink-soft">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPlaying((p) => !p)}
              className="font-sans text-[11px] uppercase tracking-wider border border-rule rounded px-3 py-1 text-ink hover:border-ink-soft hover:bg-paper-dark/40"
              aria-label={playing ? "Pause playback" : "Play timeline"}
            >
              {playing ? "❚❚ Pause" : "▶ Play"}
            </button>
            <div className="flex items-center gap-1">
              <span className="opacity-70">Speed</span>
              {[2, 5, 12, 30].map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`px-1.5 py-0.5 rounded border tabular-nums ${
                    speed === s
                      ? "border-ink text-ink"
                      : "border-rule text-ink-soft hover:border-ink-soft"
                  }`}
                  title={`${s} years per second`}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
          <div className="font-serif text-base text-ink tabular-nums">
            {formatYear(Math.round(cursorYear))}
          </div>
          <div className="opacity-70 tabular-nums">
            {formatYear(Math.round(cursorMin))} → {formatYear(Math.round(cursorMax))}
          </div>
        </div>

        {/* The track */}
        <div
          ref={scrubRef}
          className="relative h-10 cursor-pointer select-none"
          onClick={onScrubClick}
          role="slider"
          aria-valuemin={cursorMin}
          aria-valuemax={cursorMax}
          aria-valuenow={Math.round(cursorYear)}
          tabIndex={0}
          onKeyDown={(e) => {
            const step = (cursorMax - cursorMin) / 200;
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              setCursorYear((y) => Math.max(cursorMin, y - step));
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              setCursorYear((y) => Math.min(cursorMax, y + step));
            } else if (e.key === " ") {
              e.preventDefault();
              setPlaying((p) => !p);
            }
          }}
        >
          {/* Histogram */}
          <svg
            width="100%"
            height={36}
            viewBox={`0 0 1000 36`}
            preserveAspectRatio="none"
            style={{ display: "block", position: "absolute", inset: 0 }}
          >
            {trackHistogram.map((c, i) => {
              if (c === 0) return null;
              const h = (c / trackMax) * 32;
              const bw = 1000 / trackHistogram.length;
              const inPulse =
                lens
                  ? true
                  : Math.abs(
                      (cursorMin + (i + 0.5) * (cursorMax - cursorMin) / trackHistogram.length) -
                        cursorYear,
                    ) <= 8;
              return (
                <rect
                  key={i}
                  x={i * bw}
                  y={36 - h - 2}
                  width={Math.max(0.6, bw - 0.3)}
                  height={h}
                  fill={lens?.accent ?? "var(--ink-soft)"}
                  opacity={inPulse ? 0.7 : 0.3}
                />
              );
            })}
            {/* Cursor line */}
            <line
              x1={cursorT * 1000}
              x2={cursorT * 1000}
              y1={0}
              y2={36}
              stroke="var(--accent)"
              strokeWidth={1.2}
            />
          </svg>
        </div>

        <div className="mt-1 flex items-center justify-between font-sans text-[10px] text-ink-soft/70">
          <span>
            Drag or click the bar to set the year · ← → step · Space play/pause
          </span>
          <span>
            {visibleAtCursor(pins, cursorYear, lens)} events glowing
          </span>
        </div>
      </div>
    </div>
  );
}

function formatYear(y: number): string {
  if (y < 0) return `${Math.abs(y).toLocaleString()} BCE`;
  return y.toString();
}

function visibleAtCursor(
  pins: Array<{ ev: TimelineEvent }>,
  cursorYear: number,
  lens: Lens | null,
): number {
  let n = 0;
  for (const p of pins) {
    if (lens && !lens.eventIds.has(p.ev.id)) continue;
    if (Math.abs(p.ev.date.year - cursorYear) <= 5) n++;
  }
  return n;
}
