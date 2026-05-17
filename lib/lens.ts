"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * A lens is the single primitive for storytelling. Activating a lens dims
 * non-member events, scrolls the timeline into its year range, and surfaces
 * a narrative panel.
 *
 * Every "storytelling" affordance (cluster, tag, person thread, concurrency,
 * search, future guided tour) projects into the same Lens shape.
 */
export type LensKind =
  | "cluster"
  | "tag"
  | "person"
  | "concurrent"
  | "tour";

export type Lens = {
  /** Stable URL-safe id, e.g. "cluster:tag:anti-fascism". */
  id: string;
  kind: LensKind;
  label: string;
  /** Member event ids. */
  eventIds: Set<string>;
  yearRange: [number, number];
  /** Accent color from the lens palette (NOT a book color). */
  accent: string;
  /** Optional caption surfaced in the lens panel. */
  caption?: string;
};

/**
 * A small palette that complements the existing maroon accent.
 * Each entry is a CSS color; UIs should never pick book colors for lens accents.
 */
export const LENS_PALETTE: string[] = [
  "#5a6678", // slate
  "#a87a3e", // ochre
  "#6e8362", // sage
  "#7c5170", // plum
  "#a45a3c", // rust
  "#2d2a26", // deep ink
];

export function pickAccentForLensId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return LENS_PALETTE[Math.abs(hash) % LENS_PALETTE.length];
}

export type LensState = {
  lens: Lens | null;
  selectedEventId: string | null;
};

type Activator =
  | { kind: "id"; id: string }
  | {
      kind: "build";
      id: string;
      lensKind: LensKind;
      label: string;
      eventIds: string[];
      yearRange: [number, number];
      caption?: string;
    };

/**
 * URL-synced lens hook. The URL is the source of truth for `lens` and `event`
 * params so links are shareable and the back button works.
 *
 * Activating a lens by id requires a lookup function (e.g. `clustersForLensId`)
 * supplied by the parent — keeps this hook ignorant of cluster data.
 */
export function useLens(opts: {
  resolveLens: (id: string) => {
    label: string;
    kind: LensKind;
    eventIds: string[];
    yearRange: [number, number];
    caption?: string;
  } | null;
}): {
  lens: Lens | null;
  selectedEventId: string | null;
  activateLens: (a: Activator) => void;
  clearLens: () => void;
  setSelectedEventId: (id: string | null) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const lensId = searchParams.get("lens");
  const eventId = searchParams.get("event");

  // Cache of "built" lenses keyed by id (e.g. concurrent lenses computed on the fly).
  const [builtLenses, setBuiltLenses] = useState<Map<string, Lens>>(new Map());

  const lens: Lens | null = useMemo(() => {
    if (!lensId) return null;
    const built = builtLenses.get(lensId);
    if (built) return built;
    const resolved = opts.resolveLens(lensId);
    if (!resolved) return null;
    return {
      id: lensId,
      kind: resolved.kind,
      label: resolved.label,
      eventIds: new Set(resolved.eventIds),
      yearRange: resolved.yearRange,
      accent: pickAccentForLensId(lensId),
      caption: resolved.caption,
    };
    // intentionally exclude opts.resolveLens to avoid infinite renders;
    // callers should pass a stable function (memoized in their scope).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lensId, builtLenses]);

  const replaceParams = useCallback(
    (mutate: (sp: URLSearchParams) => void) => {
      const sp = new URLSearchParams(searchParams.toString());
      mutate(sp);
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const activateLens = useCallback(
    (a: Activator) => {
      if (a.kind === "build") {
        const built: Lens = {
          id: a.id,
          kind: a.lensKind,
          label: a.label,
          eventIds: new Set(a.eventIds),
          yearRange: a.yearRange,
          accent: pickAccentForLensId(a.id),
          caption: a.caption,
        };
        setBuiltLenses((m) => {
          const n = new Map(m);
          n.set(a.id, built);
          return n;
        });
      }
      replaceParams((sp) => {
        sp.set("lens", a.kind === "id" ? a.id : a.id);
      });
    },
    [replaceParams],
  );

  const clearLens = useCallback(() => {
    replaceParams((sp) => sp.delete("lens"));
  }, [replaceParams]);

  const setSelectedEventId = useCallback(
    (id: string | null) => {
      replaceParams((sp) => {
        if (id) sp.set("event", id);
        else sp.delete("event");
      });
    },
    [replaceParams],
  );

  return {
    lens,
    selectedEventId: eventId,
    activateLens,
    clearLens,
    setSelectedEventId,
  };
}

/**
 * Convenience: bind Escape to clear the topmost layer.
 * Returns nothing; just installs the global handler.
 */
export function useEscapeStack(handlers: Array<{ active: boolean; handle: () => void }>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      for (const h of handlers) {
        if (h.active) {
          h.handle();
          e.preventDefault();
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlers]);
}
