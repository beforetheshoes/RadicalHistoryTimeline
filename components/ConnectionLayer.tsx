"use client";

import { useMemo } from "react";
import type { TimelineLayout } from "@/lib/layout";

type Endpoint = {
  eventId: string;
  laneIdx: number;
  x: number;
  y: number;
  color: string;
};

type Props = {
  selectedId: string | null;
  /** Event ids to draw arcs from the selected event to. */
  connectIds: string[];
  layout: TimelineLayout;
  laneHeight: number;
  lanePaddingY: number;
};

/**
 * Soft bezier arcs from a selected event to a small set of related/concurrent
 * events. Drawn under the dots/tiles so they never block clicks.
 *
 * Per design rules: arcs only render when something is selected — never ambient.
 */
export default function ConnectionLayer({
  selectedId,
  connectIds,
  layout,
  laneHeight,
  lanePaddingY,
}: Props) {
  const arcs = useMemo(() => {
    if (!selectedId || connectIds.length === 0) return [];

    // Build an index from event id → endpoint (only events that the layout
    // actually placed — events in "bar" mode get skipped here).
    const endpoints = new Map<string, Endpoint>();
    for (const lane of layout.lanes) {
      const laneY = lane.laneIdx * (laneHeight + lanePaddingY) + lanePaddingY;
      const baselineY = laneY + laneHeight / 2;
      for (const le of lane.visibleEvents) {
        endpoints.set(le.event.id, {
          eventId: le.event.id,
          laneIdx: lane.laneIdx,
          x: le.x,
          y: baselineY + (le.stackRow - 1) * 10,
          color: lane.book.color,
        });
      }
    }

    const src = endpoints.get(selectedId);
    if (!src) return [];

    const out: Array<{
      d: string;
      stroke: string;
      key: string;
    }> = [];
    for (const id of connectIds) {
      const dst = endpoints.get(id);
      if (!dst) continue;
      // Bezier control points: bow upward when going to a lane above, downward
      // when going below; magnitude proportional to horizontal distance.
      const dx = dst.x - src.x;
      const dy = dst.y - src.y;
      const dist = Math.hypot(dx, dy);
      const bow = Math.min(180, Math.max(40, dist * 0.25));
      // Bow away from the midpoint, perpendicular-ish to the line.
      const cy1 = src.y + (dy >= 0 ? -bow : bow);
      const cy2 = dst.y + (dy >= 0 ? -bow : bow);
      const cx1 = src.x + dx * 0.35;
      const cx2 = src.x + dx * 0.65;
      const d = `M ${src.x} ${src.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${dst.x} ${dst.y}`;
      out.push({
        d,
        stroke: dst.color,
        key: `${selectedId}->${id}`,
      });
    }
    return out;
  }, [selectedId, connectIds, layout, laneHeight, lanePaddingY]);

  if (arcs.length === 0) return null;

  return (
    <g aria-hidden style={{ pointerEvents: "none" }}>
      {arcs.map((a) => (
        <path
          key={a.key}
          d={a.d}
          fill="none"
          stroke={a.stroke}
          strokeWidth={1.2}
          strokeLinecap="round"
          opacity={0.45}
        />
      ))}
    </g>
  );
}
