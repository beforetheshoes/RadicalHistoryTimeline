"use client";

import { type Era, type EraId, formatYearCompact } from "@/lib/eras";
import type { EraThemes } from "@/lib/derived";

type Props = {
  eraLayout: Array<Era & { x: number; width: number }>;
  totalDensityByEra: Record<EraId, number[]>;
  focusedEra: EraId | null;
  onFocusEra: (id: EraId | null) => void;
  eraThemes: EraThemes;
  /** Accent color for the active lens, if any. Recolors histogram bars within range. */
  lensAccent?: string;
  lensYearRange: [number, number] | null;
  onActivateTag: (tag: string) => void;
};

const LABEL_HEIGHT = 38;
const HISTO_HEIGHT = 28;
const TICK_HEIGHT = 22;
const THEMES_HEIGHT = 26;
const HEADER_HEIGHT = LABEL_HEIGHT + HISTO_HEIGHT + TICK_HEIGHT + THEMES_HEIGHT;

export default function EraScrubber({
  eraLayout,
  totalDensityByEra,
  focusedEra,
  onFocusEra,
  eraThemes,
  lensAccent,
  lensYearRange,
  onActivateTag,
}: Props) {
  const maxBucket = Math.max(
    1,
    ...Object.values(totalDensityByEra).flatMap((arr) => arr),
  );

  const totalWidth = eraLayout.reduce(
    (max, e) => Math.max(max, e.x + e.width),
    0,
  );

  /** Does the bucket-index (0..N-1) in `era` overlap the lens year range? */
  function bucketInLens(era: Era & { x: number; width: number }, i: number, n: number): boolean {
    if (!lensYearRange) return false;
    const [a, b] = lensYearRange;
    const span = era.yearEnd - era.yearStart;
    const t0 = era.yearStart + (span * i) / n;
    const t1 = era.yearStart + (span * (i + 1)) / n;
    return t1 >= a && t0 <= b;
  }

  return (
    <svg
      width="100%"
      height={HEADER_HEIGHT}
      viewBox={`0 0 ${totalWidth} ${HEADER_HEIGHT}`}
      preserveAspectRatio="none"
      style={{ display: "block" }}
    >
      {/* Background highlight for focused era */}
      {focusedEra &&
        (() => {
          const e = eraLayout.find((x) => x.id === focusedEra);
          if (!e) return null;
          return (
            <rect
              x={e.x - 2}
              y={0}
              width={e.width + 4}
              height={HEADER_HEIGHT}
              fill="var(--paper-dark)"
              opacity={0.5}
              rx={3}
            />
          );
        })()}

      {/* Lens year-range band (subtle accent stripe behind histogram) */}
      {lensYearRange &&
        lensAccent &&
        eraLayout.map((era) => {
          const [a, b] = lensYearRange;
          if (b < era.yearStart || a > era.yearEnd) return null;
          const span = era.yearEnd - era.yearStart;
          const t0 = Math.max(0, (a - era.yearStart) / span);
          const t1 = Math.min(1, (b - era.yearStart) / span);
          if (t1 <= t0) return null;
          return (
            <rect
              key={`lens-band-${era.id}`}
              x={era.x + t0 * era.width}
              y={LABEL_HEIGHT - 2}
              width={(t1 - t0) * era.width}
              height={HISTO_HEIGHT + 4}
              fill={lensAccent}
              opacity={0.1}
            />
          );
        })}

      {eraLayout.map((era) => {
        const buckets = totalDensityByEra[era.id] ?? [];
        const bucketWidth = buckets.length > 0 ? era.width / buckets.length : 0;
        const isFocused = focusedEra === era.id;
        const histoY = LABEL_HEIGHT;
        const themesY = LABEL_HEIGHT + HISTO_HEIGHT + TICK_HEIGHT;
        const theme = eraThemes[era.id];

        return (
          <g key={era.id} className="era-scrubber-group">
            <rect
              x={era.x}
              y={0}
              width={era.width}
              height={LABEL_HEIGHT}
              fill="transparent"
              style={{ cursor: "pointer" }}
              onClick={() => onFocusEra(isFocused ? null : era.id)}
            >
              <title>{`Click to ${isFocused ? "exit" : "focus on"} ${era.name}`}</title>
            </rect>

            <text
              x={era.x + era.width / 2}
              y={20}
              textAnchor="middle"
              fontFamily="var(--font-serif)"
              fontSize={era.width < 100 ? 11 : 15}
              fill="var(--ink)"
              fontWeight={isFocused ? 600 : 500}
              style={{ pointerEvents: "none" }}
            >
              {era.width < 80 ? era.shortName : era.name}
            </text>

            <text
              x={era.x + era.width / 2}
              y={34}
              textAnchor="middle"
              fontFamily="var(--font-sans)"
              fontSize={9}
              fill="var(--ink-soft)"
              style={{ pointerEvents: "none", letterSpacing: "0.05em" }}
            >
              {formatYearCompact(era.yearStart)} → {formatYearCompact(era.yearEnd)}
            </text>

            {/* Histogram — bars within the lens range take the lens accent */}
            {buckets.map((count, i) => {
              if (count === 0) return null;
              const h = (count / maxBucket) * HISTO_HEIGHT;
              const inLensRange =
                lensAccent && bucketInLens(era, i, buckets.length);
              return (
                <rect
                  key={i}
                  x={era.x + i * bucketWidth}
                  y={histoY + (HISTO_HEIGHT - h)}
                  width={Math.max(0.5, bucketWidth - 0.3)}
                  height={h}
                  fill={inLensRange ? lensAccent : "var(--ink-soft)"}
                  opacity={
                    inLensRange ? 0.95 : isFocused ? 0.9 : lensAccent ? 0.25 : 0.5
                  }
                />
              );
            })}

            <line
              x1={era.x}
              x2={era.x + era.width}
              y1={LABEL_HEIGHT + HISTO_HEIGHT + 2}
              y2={LABEL_HEIGHT + HISTO_HEIGHT + 2}
              stroke="var(--rule)"
              strokeWidth={1}
            />

            <text
              x={era.x + 2}
              y={LABEL_HEIGHT + HISTO_HEIGHT + TICK_HEIGHT - 4}
              fontFamily="var(--font-sans)"
              fontSize={9}
              fill="var(--ink-soft)"
              opacity={0.6}
              style={{ letterSpacing: "0.04em" }}
            >
              {formatYearCompact(era.yearStart)}
            </text>

            {/* Theme pills */}
            {theme && era.width > 60 && (
              <ThemeRow
                themes={theme.topTags}
                xStart={era.x + 4}
                width={era.width - 8}
                y={themesY}
                onActivateTag={onActivateTag}
              />
            )}
          </g>
        );
      })}

      {eraLayout.length > 0 && (
        <text
          x={
            eraLayout[eraLayout.length - 1].x +
            eraLayout[eraLayout.length - 1].width -
            2
          }
          y={LABEL_HEIGHT + HISTO_HEIGHT + TICK_HEIGHT - 4}
          textAnchor="end"
          fontFamily="var(--font-sans)"
          fontSize={9}
          fill="var(--ink-soft)"
          opacity={0.6}
          style={{ letterSpacing: "0.04em" }}
        >
          {formatYearCompact(eraLayout[eraLayout.length - 1].yearEnd)}
        </text>
      )}
    </svg>
  );
}

function ThemeRow({
  themes,
  xStart,
  width,
  y,
  onActivateTag,
}: {
  themes: Array<{ tag: string; count: number }>;
  xStart: number;
  width: number;
  y: number;
  onActivateTag: (tag: string) => void;
}) {
  // Pack as many pills as fit, in order; estimate width from char count.
  const PILL_PAD = 6;
  const GAP = 4;
  const CHAR_W = 5.4;
  const HEIGHT = 16;

  const pills: Array<{ tag: string; count: number; w: number; label: string }> = [];
  for (const t of themes) {
    const label = humanizeTag(t.tag);
    const w = label.length * CHAR_W + PILL_PAD * 2;
    pills.push({ tag: t.tag, count: t.count, w, label });
  }

  // Greedy fit
  const placed: Array<{ x: number; w: number; tag: string; label: string }> = [];
  let x = xStart;
  for (const p of pills) {
    if (x - xStart + p.w > width) break;
    placed.push({ x, w: p.w, tag: p.tag, label: p.label });
    x += p.w + GAP;
  }

  return (
    <g>
      {placed.map((p) => (
        <g
          key={p.tag}
          style={{ cursor: "pointer" }}
          onClick={() => onActivateTag(p.tag)}
        >
          <rect
            x={p.x}
            y={y}
            width={p.w}
            height={HEIGHT}
            rx={HEIGHT / 2}
            fill="var(--paper)"
            stroke="var(--rule)"
            strokeWidth={1}
          />
          <text
            x={p.x + p.w / 2}
            y={y + HEIGHT / 2 + 3.4}
            textAnchor="middle"
            fontFamily="var(--font-sans)"
            fontSize={9.5}
            fill="var(--ink-soft)"
            style={{ pointerEvents: "none", letterSpacing: "0.02em" }}
          >
            {p.label}
          </text>
          <title>{`Activate the "${p.label}" lens (${p.tag})`}</title>
        </g>
      ))}
    </g>
  );
}

function humanizeTag(slug: string): string {
  const overrides: Record<string, string> = {
    "spanish-civil-war": "Spanish CW",
    "russian-revolution": "Russian Rev.",
    "anti-fascism": "Anti-Fasc.",
    "anarcho-syndicalism": "Syndicalism",
    "world-war-i": "WWI",
    "world-war-ii": "WWII",
    "cold-war": "Cold War",
    "civil-war": "Civil War",
    "general-strike": "Strikes",
    "democratic-autonomy": "Dem. Auton.",
    "kurdish-liberation": "Kurdish Lib.",
    "labor-movement": "Labor",
    "state-violence": "Repression",
  };
  if (overrides[slug]) return overrides[slug];
  const parts = slug.split("-");
  const out = parts
    .map((p) =>
      p.length <= 3 && /^[a-z]+$/.test(p)
        ? p.toUpperCase()
        : p.charAt(0).toUpperCase() + p.slice(1),
    )
    .join(" ");
  return out.length > 14 ? out.slice(0, 13) + "…" : out;
}
