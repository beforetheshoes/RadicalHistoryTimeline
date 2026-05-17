"use client";

import { useCallback, useMemo, useState } from "react";
import type { Book, TimelineEvent } from "@/lib/types";
import type { EraId } from "@/lib/eras";
import type { DerivedIndex } from "@/lib/derived";
import {
  buildConcurrentLens,
  clustersForEvent,
  findConcurrent,
  resolveLensById,
} from "@/lib/storytelling";
import { useEscapeStack, useLens, type Lens } from "@/lib/lens";
import EraTimeline from "./EraTimeline";
import MapView from "./MapView";
import BookBadge from "./BookBadge";
import LensPanel from "./LensPanel";
import MeanwhileStrip from "./MeanwhileStrip";

type Props = {
  events: TimelineEvent[];
  books: Book[];
  derived: DerivedIndex;
  showBookFilter?: boolean;
};

type ViewMode = "vertical" | "horizontal" | "map";

export default function Timeline({
  events,
  books,
  derived,
  showBookFilter = true,
}: Props) {
  const bookBySlug = useMemo(
    () => Object.fromEntries(books.map((b) => [b.slug, b])),
    [books],
  );

  const resolveLens = useCallback(
    (id: string) => resolveLensById(id, derived),
    [derived],
  );

  const { lens, selectedEventId, activateLens, clearLens, setSelectedEventId } =
    useLens({ resolveLens });

  const [query, setQuery] = useState("");
  const [activeBooks, setActiveBooks] = useState<Set<string>>(
    () => new Set(books.map((b) => b.slug)),
  );
  const [viewMode, setViewMode] = useState<ViewMode>("horizontal");
  const [focusedEra, setFocusedEra] = useState<EraId | null>(null);

  // Escape stack: close drawer first, then clear lens, then unfocus era.
  useEscapeStack([
    { active: !!selectedEventId, handle: () => setSelectedEventId(null) },
    { active: !!lens, handle: clearLens },
    { active: !!focusedEra, handle: () => setFocusedEra(null) },
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (!activeBooks.has(e.book)) return false;
      if (!q) return true;
      const hay = [
        e.title,
        e.summary,
        e.displayDate,
        e.citation.quote,
        e.location ?? "",
        (e.people ?? []).join(" "),
        (e.tags ?? []).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [events, query, activeBooks]);

  const selected = useMemo(
    () => events.find((e) => e.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  const decadeYears = useMemo(() => {
    const set = new Set<number>();
    for (const e of filtered) set.add(Math.floor(e.date.year / 10) * 10);
    return [...set].sort((a, b) => a - b);
  }, [filtered]);
  void decadeYears;

  // Group events under their decade for stable rendering with markers
  const grouped = useMemo(() => {
    const map = new Map<number, TimelineEvent[]>();
    for (const e of filtered) {
      const d = Math.floor(e.date.year / 10) * 10;
      const arr = map.get(d);
      if (arr) arr.push(e);
      else map.set(d, [e]);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [filtered]);

  const totalEvents = events.length;
  const visibleEvents = filtered.length;
  const visibleInLens = useMemo(() => {
    if (!lens) return 0;
    let n = 0;
    for (const e of filtered) if (lens.eventIds.has(e.id)) n++;
    return n;
  }, [filtered, lens]);

  // Helper: is an event inside the lens (or no lens active)?
  const isInLens = useCallback(
    (id: string) => !lens || lens.eventIds.has(id),
    [lens],
  );

  // Concurrent events for the selected one (memoized).
  const concurrentEvents = useMemo(() => {
    if (!selected) return [];
    return findConcurrent(selected, events, derived, { limit: 5 });
  }, [selected, events, derived]);

  const concurrentIds = useMemo(
    () => concurrentEvents.map((e) => e.id),
    [concurrentEvents],
  );

  const clustersForSelected = useMemo(() => {
    if (!selected) return [];
    return clustersForEvent(selected.id, derived).slice(0, 6);
  }, [selected, derived]);

  const activateTagLens = useCallback(
    (tag: string) => {
      activateLens({ kind: "id", id: `tag:${tag.toLowerCase()}` });
    },
    [activateLens],
  );

  const activateConcurrent = useCallback(() => {
    if (!selected) return;
    const built = buildConcurrentLens(selected, events, derived);
    activateLens({
      kind: "build",
      id: built.id,
      lensKind: "concurrent",
      label: built.label,
      eventIds: built.eventIds,
      yearRange: built.yearRange,
      caption: built.caption,
    });
  }, [selected, events, derived, activateLens]);

  return (
    <div className="w-full px-6 py-10">
      {/* Top controls: view toggle, search, count */}
      <div className="max-w-7xl mx-auto mb-3 flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Timeline view"
          className="font-sans text-xs flex border border-rule rounded-md overflow-hidden"
        >
          <button
            role="tab"
            aria-selected={viewMode === "horizontal"}
            onClick={() => setViewMode("horizontal")}
            title="Horizontal zoomable timeline"
            className={`px-3 py-1.5 transition-colors ${
              viewMode === "horizontal"
                ? "bg-ink text-paper"
                : "bg-transparent text-ink-soft hover:text-ink"
            }`}
          >
            ↔ Timeline
          </button>
          <button
            role="tab"
            aria-selected={viewMode === "map"}
            onClick={() => setViewMode("map")}
            title="Pulse-time world map"
            className={`px-3 py-1.5 transition-colors border-l border-rule ${
              viewMode === "map"
                ? "bg-ink text-paper"
                : "bg-transparent text-ink-soft hover:text-ink"
            }`}
          >
            🌐 Map
          </button>
          <button
            role="tab"
            aria-selected={viewMode === "vertical"}
            onClick={() => setViewMode("vertical")}
            title="Vertical card view"
            className={`px-2.5 py-1.5 text-[10px] transition-colors border-l border-rule ${
              viewMode === "vertical"
                ? "bg-ink text-paper"
                : "bg-transparent text-ink-soft/70 hover:text-ink"
            }`}
          >
            ☰ Cards
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, quotes, people, places…"
            className="font-sans text-sm bg-paper-dark/40 border border-rule rounded-md px-3 py-1.5 w-72 max-w-full focus:outline-none focus:border-accent placeholder:text-ink-soft/70"
          />
          <span className="font-sans text-xs text-ink-soft whitespace-nowrap tabular-nums">
            {visibleEvents} of {totalEvents}
          </span>
        </div>
      </div>

      {/* Compact book legend */}
      {showBookFilter && (
        <div className="max-w-7xl mx-auto mb-4 flex flex-wrap items-center gap-1">
          {(() => {
            const allActive = activeBooks.size === books.length;
            return (
              <button
                onClick={() =>
                  setActiveBooks(new Set(books.map((b) => b.slug)))
                }
                disabled={allActive}
                className={`font-sans text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border transition-all ${
                  allActive
                    ? "border-ink bg-ink text-paper cursor-default"
                    : "border-rule text-ink-soft hover:border-ink hover:text-ink"
                }`}
                title="Show events from all books"
              >
                All
              </button>
            );
          })()}
          {books.map((b) => {
            const active = activeBooks.has(b.slug);
            const soloed = active && activeBooks.size === 1;
            return (
              <button
                key={b.slug}
                onClick={(e) => {
                  setActiveBooks((prev) => {
                    if (e.metaKey || e.ctrlKey) {
                      const next = new Set(prev);
                      if (next.has(b.slug)) next.delete(b.slug);
                      else next.add(b.slug);
                      if (next.size === 0) next.add(b.slug);
                      return next;
                    }
                    if (soloed) {
                      return new Set(books.map((bk) => bk.slug));
                    }
                    return new Set([b.slug]);
                  });
                }}
                className={`font-sans text-[10px] px-2 py-0.5 rounded-full border transition-all inline-flex items-center gap-1.5 ${
                  active
                    ? "text-ink border-ink-soft/40 bg-paper-dark/30"
                    : "text-ink-soft/70 border-rule bg-transparent hover:border-ink-soft hover:text-ink opacity-70"
                }`}
                title={`${b.title} — ${b.author}\nClick to solo · Cmd/Ctrl-click to multi-select`}
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: b.color }}
                />
                <span className="font-semibold">{b.title}</span>
                <span className="opacity-60 font-normal italic">
                  {b.author}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Lens panel (shown when a lens is active) */}
      {lens && (
        <div className="max-w-7xl mx-auto mb-6">
          <LensPanel
            lens={lens}
            totalEvents={totalEvents}
            visibleInLens={visibleInLens}
            onClear={clearLens}
          />
        </div>
      )}

      {visibleEvents === 0 ? (
        <p className="max-w-7xl mx-auto font-sans text-center text-ink-soft py-20">
          No events match the current filters.
        </p>
      ) : viewMode === "map" ? (
        <MapView
          events={filtered}
          books={books}
          derived={derived}
          lens={lens}
          selectedId={selectedEventId}
          onSelect={(id) => setSelectedEventId(id)}
        />
      ) : viewMode === "horizontal" ? (
        <EraTimeline
          events={filtered}
          books={books}
          derived={derived}
          lens={lens}
          selectedId={selectedEventId}
          onSelect={(id) => setSelectedEventId(id)}
          focusedEra={focusedEra}
          onFocusEra={setFocusedEra}
          concurrentIds={concurrentIds}
          onActivateTag={activateTagLens}
        />
      ) : (
        <div className="max-w-7xl mx-auto relative">
          {/* Center line */}
          <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-px bg-rule md:-translate-x-1/2" />

          {grouped.map(([decade, items]) => (
            <section key={decade} className="relative">
              <div className="relative flex items-center justify-start md:justify-center py-6">
                <span className="font-serif text-3xl md:text-4xl tracking-tight bg-paper px-4 ml-8 md:ml-0 text-ink relative z-10">
                  {decade < 0
                    ? `${Math.abs(decade).toLocaleString()}s BCE`
                    : `${decade}s`}
                </span>
              </div>

              <ul className="space-y-6">
                {items.map((event, i) => {
                  const book = bookBySlug[event.book];
                  const onLeft = i % 2 === 0;
                  const inLens = isInLens(event.id);
                  return (
                    <li
                      key={event.id}
                      className={`relative md:grid md:grid-cols-2 md:gap-10`}
                      style={{
                        opacity: inLens ? 1 : 0.12,
                        transition: "opacity 400ms ease",
                      }}
                    >
                      <span
                        className="absolute left-4 md:left-1/2 top-6 w-3 h-3 rounded-full md:-translate-x-1/2 ring-4 ring-paper z-10"
                        style={{
                          backgroundColor: book?.color ?? "var(--ink)",
                        }}
                      />

                      <div
                        className={`pl-10 md:pl-0 ${
                          onLeft
                            ? "md:col-start-1 md:pr-6 md:text-right"
                            : "md:col-start-2 md:pl-6"
                        }`}
                      >
                        <button
                          onClick={() => setSelectedEventId(event.id)}
                          className="text-left w-full group block bg-paper-dark/30 border border-rule rounded-lg px-5 py-4 hover:border-accent hover:bg-paper-dark/60 transition-all"
                          style={{
                            borderLeftWidth: onLeft ? "1px" : "3px",
                            borderRightWidth: onLeft ? "3px" : "1px",
                            borderLeftColor: onLeft ? undefined : book?.color,
                            borderRightColor: onLeft ? book?.color : undefined,
                          }}
                        >
                          <div
                            className={`flex items-baseline gap-3 mb-1 ${onLeft ? "md:justify-end" : ""}`}
                          >
                            <span
                              className="font-sans text-xs uppercase tracking-wider font-semibold"
                              style={{ color: book?.color }}
                            >
                              {event.displayDate}
                            </span>
                            {event.category && (
                              <span className="font-sans text-[10px] uppercase tracking-wider text-ink-soft border border-rule px-1.5 py-0.5 rounded">
                                {event.category}
                              </span>
                            )}
                          </div>
                          <h3 className="font-serif text-lg leading-snug text-ink group-hover:text-accent transition-colors">
                            {event.title}
                          </h3>
                          <p className="font-sans text-sm text-ink-soft mt-1.5 leading-relaxed">
                            {event.summary}
                          </p>
                          <div
                            className={`mt-3 flex flex-wrap items-center gap-1.5 ${onLeft ? "md:justify-end" : ""}`}
                          >
                            {book && (
                              <BookBadge
                                book={book}
                                align={onLeft ? "right" : "left"}
                              />
                            )}
                            {event.location && (
                              <span className="font-sans text-[11px] text-ink-soft bg-paper/60 border border-rule px-2 py-0.5 rounded-full">
                                {event.location}
                              </span>
                            )}
                            {event.people?.slice(0, 3).map((p) => (
                              <span
                                key={p}
                                className="font-sans text-[11px] text-ink-soft bg-paper/60 border border-rule px-2 py-0.5 rounded-full"
                              >
                                {p}
                              </span>
                            ))}
                            {event.people && event.people.length > 3 && (
                              <span className="font-sans text-[11px] text-ink-soft px-1">
                                +{event.people.length - 3}
                              </span>
                            )}
                            {event.citation.page !== undefined && (
                              <span className="font-sans text-[11px] text-ink-soft/70 px-1">
                                p.&nbsp;{event.citation.page}
                              </span>
                            )}
                          </div>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Drawer */}
      {selected && (
        <EventDrawer
          event={selected}
          book={bookBySlug[selected.book]}
          booksBySlug={bookBySlug}
          derived={derived}
          lens={lens}
          concurrentEvents={concurrentEvents}
          clusters={clustersForSelected}
          onClose={() => setSelectedEventId(null)}
          onSelectEvent={(id) => setSelectedEventId(id)}
          onActivateTag={activateTagLens}
          onActivateCluster={(id) =>
            activateLens({ kind: "id", id })
          }
          onActivateConcurrent={activateConcurrent}
        />
      )}
    </div>
  );
}

function EventDrawer({
  event,
  book,
  booksBySlug,
  derived,
  lens,
  concurrentEvents,
  clusters,
  onClose,
  onSelectEvent,
  onActivateTag,
  onActivateCluster,
  onActivateConcurrent,
}: {
  event: TimelineEvent;
  book: Book | undefined;
  booksBySlug: Record<string, Book>;
  derived: DerivedIndex;
  lens: Lens | null;
  concurrentEvents: TimelineEvent[];
  clusters: ReturnType<typeof clustersForEvent>;
  onClose: () => void;
  onSelectEvent: (id: string) => void;
  onActivateTag: (tag: string) => void;
  onActivateCluster: (id: string) => void;
  onActivateConcurrent: () => void;
}) {
  const region = event.location ? derived.geo[event.location]?.region : undefined;
  return (
    <>
      <button
        aria-label="Close detail"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm"
      />
      <aside className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-xl bg-paper border-l border-rule shadow-2xl flex flex-col">
        <div
          className="px-6 py-4 border-b border-rule flex items-center justify-between"
          style={{ borderTopWidth: 4, borderTopColor: book?.color }}
        >
          <div>
            <p
              className="font-sans text-xs uppercase tracking-wider font-semibold"
              style={{ color: book?.color }}
            >
              {event.displayDate}
            </p>
            <p className="font-sans text-[11px] text-ink-soft mt-0.5">
              {book?.author} · <em>{book?.title}</em>
            </p>
          </div>
          <button
            onClick={onClose}
            className="font-sans text-xs uppercase tracking-wider text-ink-soft hover:text-ink border border-rule rounded px-2 py-1"
          >
            Close ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <h2 className="font-serif text-2xl leading-tight mb-4">
            {event.title}
          </h2>

          <p className="font-sans text-sm text-ink-soft leading-relaxed mb-6">
            {event.summary}
          </p>

          {/* Meta chips: category, location/region, people */}
          <div className="mb-6 flex flex-wrap gap-2 font-sans text-xs">
            {event.category && (
              <span className="border border-rule px-2 py-1 rounded-full uppercase tracking-wider text-ink-soft">
                {event.category}
              </span>
            )}
            {event.location && (
              <span className="border border-rule px-2 py-1 rounded-full text-ink-soft">
                {event.location}
                {region && region !== event.location && (
                  <span className="opacity-60"> · {region}</span>
                )}
              </span>
            )}
            {event.people?.map((p) => (
              <span
                key={p}
                className="border border-rule px-2 py-1 rounded-full text-ink-soft"
              >
                {p}
              </span>
            ))}
          </div>

          {/* Tags — clickable to activate a tag lens */}
          {event.tags && event.tags.length > 0 && (
            <div className="mb-6">
              <p className="font-sans text-[10px] uppercase tracking-[0.18em] text-ink-soft/80 mb-2">
                Tags
              </p>
              <div className="flex flex-wrap gap-1.5">
                {event.tags.map((t) => {
                  const canonical =
                    derived.vocab.alias[t.toLowerCase()] ?? t.toLowerCase();
                  const isActive = lens?.id === `tag:${canonical}`;
                  return (
                    <button
                      key={t}
                      onClick={() => onActivateTag(canonical)}
                      className={`font-sans text-[11px] border px-2 py-1 rounded-full transition-colors ${
                        isActive
                          ? "border-ink bg-ink text-paper"
                          : "border-rule text-ink-soft hover:border-ink-soft hover:text-ink"
                      }`}
                      title={`Filter to events tagged ${canonical}`}
                    >
                      #{canonical}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Part of: clusters this event belongs to */}
          {clusters.length > 0 && (
            <div className="mb-6">
              <p className="font-sans text-[10px] uppercase tracking-[0.18em] text-ink-soft/80 mb-2">
                Part of
              </p>
              <div className="flex flex-wrap gap-1.5">
                {clusters.map((c) => {
                  const isActive = lens?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => onActivateCluster(c.id)}
                      className={`font-sans text-[11px] border px-2.5 py-1 rounded transition-colors text-left ${
                        isActive
                          ? "border-ink bg-ink text-paper"
                          : "border-rule text-ink hover:border-ink-soft hover:bg-paper-dark/40"
                      }`}
                      title={`${c.eventIds.length} events · ${c.books.length} books`}
                    >
                      <span className="font-serif">{c.label}</span>
                      <span className="ml-1.5 opacity-60 tabular-nums">
                        {c.eventIds.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quote */}
          <div
            className="border-l-2 pl-4 my-6"
            style={{ borderColor: book?.color }}
          >
            <p className="font-serif italic text-ink leading-relaxed">
              &ldquo;{event.citation.quote}&rdquo;
            </p>
            <p className="font-sans text-xs text-ink-soft mt-3">
              — {event.citation.chapter}
              {event.citation.page !== undefined && (
                <>, p.&nbsp;{event.citation.page}</>
              )}
              <span className="opacity-60">
                {" "}
                · ¶{event.citation.paragraphIndex}
              </span>
            </p>
          </div>

          {/* Meanwhile elsewhere */}
          <div className="mt-8 pt-6 border-t border-rule">
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <p className="font-sans text-[10px] uppercase tracking-[0.18em] text-ink-soft/80">
                  Meanwhile
                </p>
                <p className="font-serif text-base text-ink mt-0.5">
                  Around {event.displayDate}, elsewhere…
                </p>
              </div>
              {concurrentEvents.length > 0 && (
                <button
                  onClick={onActivateConcurrent}
                  className="font-sans text-[10px] uppercase tracking-wider text-accent hover:underline"
                  title="See everything happening within ±5 years"
                >
                  See all →
                </button>
              )}
            </div>
            <MeanwhileStrip
              events={concurrentEvents}
              booksBySlug={booksBySlug}
              geo={derived.geo}
              selectedYear={event.date.year}
              onSelectEvent={onSelectEvent}
            />
          </div>

          <dl className="font-sans text-xs text-ink-soft grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 mt-8 pt-4 border-t border-rule">
            <dt className="uppercase tracking-wider">Date precision</dt>
            <dd>{event.date.precision}</dd>
            <dt className="uppercase tracking-wider">Event ID</dt>
            <dd className="font-mono">{event.id}</dd>
          </dl>
        </div>
      </aside>
    </>
  );
}
