"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Book, TimelineEvent } from "@/lib/types";
import { ERAS, type EraId, eraForYear, computeEraLayout } from "@/lib/eras";
import { computeLayout } from "@/lib/layout";
import type { DerivedIndex } from "@/lib/derived";
import type { Lens } from "@/lib/lens";
import EraScrubber from "./EraScrubber";
import ConnectionLayer from "./ConnectionLayer";

/**
 * Anchor years for the year-jump shortcut buttons. Each jumps focus to the
 * containing era; if the era is already focused, it's a no-op.
 */
const YEAR_ANCHORS: Array<{ year: number; label: string }> = [
  { year: -3000, label: "−3,000" },
  { year: 500, label: "500" },
  { year: 1500, label: "1500" },
  { year: 1789, label: "1789" },
  { year: 1871, label: "1871" },
  { year: 1917, label: "1917" },
  { year: 1936, label: "1936" },
  { year: 1968, label: "1968" },
  { year: 2011, label: "2011" },
];

type Props = {
  events: TimelineEvent[];
  books: Book[];
  derived: DerivedIndex;
  lens: Lens | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  focusedEra: EraId | null;
  onFocusEra: (id: EraId | null) => void;
  /** Event ids to connect from the selected event with arcs. */
  concurrentIds: string[];
  /** Called when a scrubber theme pill is clicked. */
  onActivateTag: (tag: string) => void;
};

const LANE_HEIGHT = 76;
const LANE_PADDING_Y = 8;
const LANE_LABEL_WIDTH = 140;
const DENSITY_BAR_HEIGHT = 44;
const DOT_RADIUS = 4;
const TILE_HEIGHT = 58;
const TILE_WIDTH = 200;

/** Lighten a hex color for use as a soft background tint. */
function tint(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  return `${hex}${Math.round(a * 255)
    .toString(16)
    .padStart(2, "0")}`;
}

export default function EraTimeline({
  events,
  books,
  derived,
  lens,
  selectedId,
  onSelect,
  focusedEra,
  onFocusEra,
  concurrentIds,
  onActivateTag,
}: Props) {
  void derived;
  const lensSet = lens?.eventIds;
  const inLens = useCallback(
    (id: string) => !lensSet || lensSet.has(id),
    [lensSet],
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1000);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverBarEra, setHoverBarEra] = useState<EraId | null>(null);
  const [intraZoom, setIntraZoom] = useState(1);

  // Reset zoom whenever focus changes.
  useEffect(() => {
    setIntraZoom(1);
  }, [focusedEra]);

  const adjustZoom = useCallback(
    (delta: number) => {
      if (!focusedEra) return;
      setIntraZoom((z) => Math.max(1, Math.min(40, z * Math.pow(1.2, delta))));
    },
    [focusedEra],
  );

  // Observe container width
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(Math.max(600, entry.contentRect.width));
      }
    });
    ro.observe(el);
    setContainerWidth(el.getBoundingClientRect().width || 1000);
    return () => ro.disconnect();
  }, []);

  // Jump focus to whichever era contains the given year.
  const jumpToYear = useCallback(
    (year: number) => {
      const era = eraForYear(year);
      onFocusEra(era.id);
    },
    [onFocusEra],
  );

  // Keyboard navigation.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't hijack typing in inputs
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      if (e.key === "Escape") {
        if (selectedId) {
          onSelect(null);
          e.preventDefault();
          return;
        }
        if (focusedEra) {
          onFocusEra(null);
          e.preventDefault();
          return;
        }
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const dir = e.key === "ArrowLeft" ? -1 : 1;
        const idx = focusedEra
          ? ERAS.findIndex((era) => era.id === focusedEra)
          : -1;
        const nextIdx =
          idx === -1
            ? dir > 0
              ? 0
              : ERAS.length - 1
            : Math.max(0, Math.min(ERAS.length - 1, idx + dir));
        onFocusEra(ERAS[nextIdx].id);
        return;
      }
      if (e.key === "+" || e.key === "=") {
        if (focusedEra) {
          e.preventDefault();
          adjustZoom(1);
        }
        return;
      }
      if (e.key === "-" || e.key === "_") {
        if (focusedEra) {
          e.preventDefault();
          adjustZoom(-1);
        }
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focusedEra, selectedId, onFocusEra, onSelect, adjustZoom]);

  const usableWidth = Math.max(600, containerWidth - LANE_LABEL_WIDTH);

  const layout = useMemo(
    () => computeLayout(events, books, usableWidth, focusedEra, intraZoom),
    [events, books, usableWidth, focusedEra, intraZoom],
  );

  // The SVG can grow wider than the viewport when intraZoom > 1.
  const svgWidth = useMemo(() => {
    const lastEra = layout.eraLayout[layout.eraLayout.length - 1];
    return Math.max(usableWidth, lastEra.x + lastEra.width);
  }, [layout, usableWidth]);

  // The scrubber always uses the un-zoomed layout, so it stays at viewport
  // width even when the main view is scrolling horizontally.
  const scrubberLayout = useMemo(
    () => computeEraLayout(usableWidth, focusedEra, 1),
    [usableWidth, focusedEra],
  );

  const totalHeight =
    books.length * (LANE_HEIGHT + LANE_PADDING_Y) + LANE_PADDING_Y;

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-paper border border-rule rounded-lg overflow-hidden"
    >
      {/* Header strip with era scrubber */}
      <div
        className="border-b border-rule"
        style={{ paddingLeft: LANE_LABEL_WIDTH }}
      >
        <EraScrubber
          eraLayout={scrubberLayout}
          totalDensityByEra={layout.totalDensityByEra}
          focusedEra={focusedEra}
          onFocusEra={onFocusEra}
          eraThemes={derived.eraThemes}
          lensAccent={lens?.accent}
          lensYearRange={lens?.yearRange ?? null}
          onActivateTag={onActivateTag}
        />
      </div>

      {/* Controls bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-rule bg-paper-dark/20 font-sans text-[11px] text-ink-soft flex-wrap">
        <span className="whitespace-nowrap">
          {focusedEra ? (
            <>
              <span className="font-semibold text-ink">
                {ERAS.find((e) => e.id === focusedEra)?.name}
              </span>{" "}
              focused &middot;{" "}
              <button
                onClick={() => onFocusEra(null)}
                className="text-accent hover:underline"
              >
                show all eras
              </button>
            </>
          ) : (
            <>Click an era band above to focus on it</>
          )}
        </span>

        {/* Year-jump anchors */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="opacity-60 mr-1">Jump:</span>
          {YEAR_ANCHORS.map((a) => {
            const era = eraForYear(a.year);
            const isActiveEra = focusedEra === era.id;
            return (
              <button
                key={a.year}
                onClick={() => jumpToYear(a.year)}
                className={`px-1.5 py-0.5 rounded border transition-colors ${
                  isActiveEra
                    ? "border-accent text-accent"
                    : "border-rule text-ink-soft hover:border-ink-soft hover:text-ink"
                }`}
                title={`Focus the era containing ${a.label}`}
              >
                {a.label}
              </button>
            );
          })}
        </div>

        <span className="opacity-70 whitespace-nowrap">
          {events.length.toLocaleString()} events
        </span>
      </div>

      {/* Keyboard + zoom hint */}
      <div className="flex items-center justify-between px-4 py-1 border-b border-rule font-sans text-[10px] text-ink-soft/70 bg-paper-dark/10">
        <span>
          Keyboard: ← → switch era · {focusedEra ? "+ / − zoom · " : ""}Esc clear
        </span>
        {focusedEra && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => adjustZoom(-1)}
              disabled={intraZoom <= 1}
              className="px-2 py-0.5 rounded border border-rule hover:border-ink-soft disabled:opacity-40 disabled:cursor-not-allowed"
              title="Zoom out (−)"
            >
              −
            </button>
            <span className="opacity-70 tabular-nums min-w-[3em] text-center">
              {intraZoom.toFixed(1)}×
            </span>
            <button
              onClick={() => adjustZoom(1)}
              disabled={intraZoom >= 40}
              className="px-2 py-0.5 rounded border border-rule hover:border-ink-soft disabled:opacity-40 disabled:cursor-not-allowed"
              title="Zoom in (+)"
            >
              +
            </button>
            <button
              onClick={() => setIntraZoom(1)}
              disabled={intraZoom === 1}
              className="ml-2 px-2 py-0.5 rounded border border-rule hover:border-ink-soft disabled:opacity-40 disabled:cursor-not-allowed"
              title="Reset zoom"
            >
              Reset
            </button>
          </div>
        )}
      </div>

      {/* Main timeline body */}
      <div className="flex">
        {/* Lane labels (sticky during horizontal scroll) */}
        <div
          className="flex flex-col flex-shrink-0 border-r border-rule bg-paper-dark/10 sticky left-0 z-10"
          style={{ width: LANE_LABEL_WIDTH }}
        >
          {layout.lanes.map((lane) => (
            <div
              key={lane.book.slug}
              className="flex items-center px-3 border-b border-rule last:border-b-0"
              style={{ height: LANE_HEIGHT + LANE_PADDING_Y }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: lane.book.color }}
                />
                <div className="min-w-0">
                  <div
                    className="font-sans text-[10px] uppercase tracking-wider font-semibold truncate"
                    style={{ color: lane.book.color }}
                  >
                    {lane.book.shortName}
                  </div>
                  <div className="font-sans text-[9px] text-ink-soft truncate">
                    {lane.book.author.split(/[,&]/)[0].trim()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* SVG lanes — horizontally scrollable when intra-era zoom > 1 */}
        <div
          ref={scrollRef}
          className="overflow-x-auto overflow-y-hidden flex-1"
          onWheel={(e) => {
            if (!focusedEra) return;
            // Cmd/Ctrl + wheel = zoom; plain wheel = horizontal scroll (default)
            if (e.metaKey || e.ctrlKey) {
              e.preventDefault();
              adjustZoom(e.deltaY < 0 ? 0.5 : -0.5);
            }
          }}
        >
        <svg
          width={svgWidth}
          height={totalHeight}
          viewBox={`0 0 ${svgWidth} ${totalHeight}`}
          preserveAspectRatio="none"
          style={{ display: "block" }}
        >
          {/* Era boundary backgrounds (subtle stripe per era for visual separation) */}
          {layout.eraLayout.map((era, idx) => (
            <rect
              key={era.id}
              x={era.x}
              y={0}
              width={era.width}
              height={totalHeight}
              fill={idx % 2 === 0 ? "transparent" : "var(--paper-dark)"}
              opacity={idx % 2 === 0 ? 0 : 0.25}
            />
          ))}

          {/* Era boundary lines */}
          {layout.eraLayout.slice(0, -1).map((era) => (
            <line
              key={`gut-${era.id}`}
              x1={era.x + era.width + 4}
              x2={era.x + era.width + 4}
              y1={0}
              y2={totalHeight}
              stroke="var(--rule)"
              strokeWidth={1}
              strokeDasharray="2,3"
              opacity={0.6}
            />
          ))}

          {/* Concurrency arcs — drawn below dots/tiles so they never block clicks */}
          <ConnectionLayer
            selectedId={selectedId}
            connectIds={concurrentIds}
            layout={layout}
            laneHeight={LANE_HEIGHT}
            lanePaddingY={LANE_PADDING_Y}
          />

          {/* Lanes */}
          {layout.lanes.map((lane) => {
            const laneY = lane.laneIdx * (LANE_HEIGHT + LANE_PADDING_Y) + LANE_PADDING_Y;
            const baselineY = laneY + LANE_HEIGHT / 2;

            return (
              <g key={lane.book.slug}>
                {/* Lane baseline */}
                <line
                  x1={0}
                  x2={svgWidth}
                  y1={laneY + LANE_HEIGHT + LANE_PADDING_Y / 2}
                  y2={laneY + LANE_HEIGHT + LANE_PADDING_Y / 2}
                  stroke="var(--rule)"
                  strokeWidth={1}
                  opacity={0.5}
                />

                {/* Density bars: render per era when mode is "bar".
                    Bars are clickable — click focuses the era + zooms in so
                    the user can actually see the events that collapsed into
                    the bar. */}
                {layout.eraLayout.map((era) => {
                  if (lane.modeByEra[era.id] !== "bar") return null;
                  const buckets = lane.densityByEra[era.id] ?? [];
                  if (buckets.length === 0) return null;
                  const maxBucket = Math.max(1, ...buckets);
                  const bucketWidth = era.width / buckets.length;
                  const isFocusedEra = focusedEra === era.id;
                  // Dim density bars when a lens is active and this era's
                  // range falls outside the lens's year range entirely.
                  const lensActive = !!lens;
                  const dimBars =
                    lensActive &&
                    lens!.yearRange[1] < era.yearStart - 0.5;
                  const dimBarsRight =
                    lensActive && lens!.yearRange[0] > era.yearEnd + 0.5;
                  const eraDim = dimBars || dimBarsRight;
                  return (
                    <g
                      key={`bars-${era.id}`}
                      role="button"
                      tabIndex={0}
                      style={{
                        cursor: "pointer",
                        transition: "opacity 400ms ease",
                      }}
                      opacity={eraDim ? 0.18 : 1}
                      onClick={() => {
                        // Focus this era and bump intra-zoom so the events
                        // resolve into dots/tiles rather than bars.
                        if (!isFocusedEra) onFocusEra(era.id);
                        setIntraZoom((z) => (z < 6 ? 8 : z));
                      }}
                      onMouseEnter={() => setHoverBarEra(era.id)}
                      onMouseLeave={() => setHoverBarEra(null)}
                    >
                      {/* Invisible hit rect spanning the era's strip on this
                          lane — makes the empty space between bars clickable
                          too, so users don't have to aim at thin bars. */}
                      <rect
                        x={era.x}
                        y={baselineY - DENSITY_BAR_HEIGHT / 2}
                        width={era.width}
                        height={DENSITY_BAR_HEIGHT}
                        fill="transparent"
                      >
                        <title>{`${era.name} · ${eraCount(lane.book.slug, era.id, events)} ${
                          lane.book.shortName
                        } events — click to zoom in`}</title>
                      </rect>
                      {/* Hover backdrop highlight */}
                      {hoverBarEra === era.id && (
                        <rect
                          x={era.x}
                          y={baselineY - DENSITY_BAR_HEIGHT / 2 - 2}
                          width={era.width}
                          height={DENSITY_BAR_HEIGHT + 4}
                          fill={lane.book.color}
                          opacity={0.08}
                        />
                      )}
                      {buckets.map((count, i) => {
                        if (count === 0) return null;
                        const h = Math.max(2, (count / maxBucket) * DENSITY_BAR_HEIGHT);
                        return (
                          <rect
                            key={i}
                            x={era.x + i * bucketWidth}
                            y={baselineY - h / 2}
                            width={Math.max(0.6, bucketWidth - 0.4)}
                            height={h}
                            fill={lane.book.color}
                            opacity={hoverBarEra === era.id ? 0.95 : 0.65}
                          />
                        );
                      })}
                    </g>
                  );
                })}

                {/* Dots */}
                {lane.visibleEvents
                  .filter((le) => {
                    const mode = lane.modeByEra[le.eraId];
                    return mode === "dot";
                  })
                  .map((le) => {
                    const stackY =
                      baselineY +
                      (le.stackRow - 1) * 10; // distribute around baseline
                    const isSelected = selectedId === le.event.id;
                    const isHover = hoverId === le.event.id;
                    const dim = !inLens(le.event.id);
                    return (
                      <circle
                        key={le.event.id}
                        cx={le.x}
                        cy={stackY}
                        r={isSelected ? DOT_RADIUS + 2 : isHover ? DOT_RADIUS + 1 : DOT_RADIUS}
                        fill={lane.book.color}
                        stroke={isSelected ? "var(--accent)" : "var(--paper)"}
                        strokeWidth={isSelected ? 2 : 1}
                        opacity={dim ? 0.12 : 1}
                        style={{ cursor: "pointer", transition: "opacity 400ms ease" }}
                        onMouseEnter={() => setHoverId(le.event.id)}
                        onMouseLeave={() => setHoverId(null)}
                        onClick={() => onSelect(le.event.id)}
                      >
                        <title>{`${le.event.displayDate} — ${le.event.title}\n${lane.book.shortName}`}</title>
                      </circle>
                    );
                  })}

                {/* Tiles */}
                {lane.visibleEvents
                  .filter((le) => lane.modeByEra[le.eraId] === "tile")
                  .map((le) => {
                    const isSelected = selectedId === le.event.id;
                    const isHover = hoverId === le.event.id;
                    const tileWidth = TILE_WIDTH;
                    const tileX = le.x;
                    const tileY =
                      baselineY -
                      TILE_HEIGHT / 2 +
                      (le.stackRow % 2 === 0 ? -6 : 6);
                    const accent = lane.book.color;
                    // Conservative chars-per-pixel for text truncation
                    const titleChars = Math.floor((tileWidth - 16) / 6.5);
                    const metaChars = Math.floor((tileWidth - 16) / 5.5);

                    const dim = !inLens(le.event.id);
                    return (
                      <g
                        key={le.event.id}
                        style={{ cursor: "pointer", transition: "opacity 400ms ease" }}
                        opacity={dim ? 0.12 : 1}
                        onMouseEnter={() => setHoverId(le.event.id)}
                        onMouseLeave={() => setHoverId(null)}
                        onClick={() => onSelect(le.event.id)}
                      >
                        <rect
                          x={tileX}
                          y={tileY}
                          width={tileWidth}
                          height={TILE_HEIGHT}
                          rx={2}
                          fill={
                            isSelected
                              ? tint(accent, 0.18)
                              : isHover
                                ? "var(--paper-dark)"
                                : "var(--paper)"
                          }
                          stroke={
                            isSelected ? accent : isHover ? accent : "var(--rule)"
                          }
                          strokeWidth={isSelected ? 1.5 : 1}
                        />
                        {/* Left book-color bar */}
                        <rect
                          x={tileX}
                          y={tileY}
                          width={3}
                          height={TILE_HEIGHT}
                          fill={accent}
                        />
                        {/* Top row: book title (book color, prominent) */}
                        <text
                          x={tileX + 10}
                          y={tileY + 14}
                          fontFamily="var(--font-sans)"
                          fontSize={9}
                          fontWeight={700}
                          fill={accent}
                          style={{
                            letterSpacing: "0.09em",
                            textTransform: "uppercase",
                            pointerEvents: "none",
                          }}
                        >
                          {truncate(lane.book.shortName, metaChars)}
                        </text>
                        {/* Date — small, right-aligned */}
                        <text
                          x={tileX + tileWidth - 8}
                          y={tileY + 14}
                          textAnchor="end"
                          fontFamily="var(--font-sans)"
                          fontSize={9}
                          fontWeight={600}
                          fill="var(--ink-soft)"
                          style={{
                            letterSpacing: "0.05em",
                            pointerEvents: "none",
                          }}
                        >
                          {le.event.displayDate}
                        </text>
                        {/* Event title (serif) */}
                        <text
                          x={tileX + 10}
                          y={tileY + 32}
                          fontFamily="var(--font-serif)"
                          fontSize={13}
                          fill="var(--ink)"
                          style={{ pointerEvents: "none" }}
                        >
                          {truncate(le.event.title, titleChars)}
                        </text>
                        {/* Bottom row: location and/or category */}
                        {(le.event.location || le.event.category) && (
                          <text
                            x={tileX + 10}
                            y={tileY + 48}
                            fontFamily="var(--font-sans)"
                            fontSize={9}
                            fill="var(--ink-soft)"
                            style={{ pointerEvents: "none" }}
                          >
                            {truncate(
                              [le.event.location, le.event.category]
                                .filter(Boolean)
                                .join(" · "),
                              metaChars,
                            )}
                          </text>
                        )}
                        <title>{`${le.event.displayDate} — ${le.event.title}\n${lane.book.shortName}${
                          le.event.location ? ` · ${le.event.location}` : ""
                        }`}</title>
                      </g>
                    );
                  })}
              </g>
            );
          })}
        </svg>
        </div>
      </div>

      {/* Footer help */}
      <div className="px-4 py-2 border-t border-rule font-sans text-[10px] text-ink-soft flex items-center justify-between">
        <span>
          Density bars show event counts where individual events are too dense
          to render. Click a tile for the full passage.
        </span>
        <span className="opacity-60">{books.length} lanes</span>
      </div>
    </div>
  );
}

function truncate(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  return s.slice(0, Math.max(0, maxChars - 1)) + "…";
}

/** Count events of a given book that fall in a given era. */
function eraCount(
  bookSlug: string,
  eraId: EraId,
  events: TimelineEvent[],
): number {
  let n = 0;
  for (const e of events) {
    if (e.book !== bookSlug) continue;
    const era = eraForYear(e.date.year);
    if (era.id === eraId) n++;
  }
  return n;
}
