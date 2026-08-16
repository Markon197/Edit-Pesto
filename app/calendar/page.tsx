"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Masthead from "@/components/Masthead";
import PastaLoader from "@/components/PastaLoader";
import { downloadIcs } from "@/lib/ics";
import { EVENT_TAGS, TAG_LABELS, type CalendarEvent, type EventTag } from "@/lib/events";

type ScanCandidate = {
  title: string;
  startDate: string;
  endDate: string | null;
  location: string | null;
  description: string;
  link: string | null;
};

type ScanKind = "event" | "earnings" | "holiday";

type ScanState = {
  loading: boolean;
  candidates: ScanCandidate[] | null;
  addedKeys: Set<string>;
  error: string | null;
  windowEndISO?: string;
};

const EMPTY_SCAN: ScanState = { loading: false, candidates: null, addedKeys: new Set(), error: null };

const SCAN_CONFIG: Record<ScanKind, { url: string; tag: EventTag; buttonLabel: string; loadingLabel: string }> = {
  event: {
    url: "/api/scan/events",
    tag: "event",
    buttonLabel: "🔍 Scan insurance events",
    loadingLabel: "Simmering the web for industry events…",
  },
  earnings: {
    url: "/api/scan/earnings",
    tag: "earnings",
    buttonLabel: "🔍 Scan earnings calendar",
    loadingLabel: "Stirring up the earnings calendar…",
  },
  holiday: {
    url: "/api/holidays",
    tag: "holiday",
    buttonLabel: "📅 Add UK bank holidays",
    loadingLabel: "Fetching UK bank holidays…",
  },
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoFor(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function formatDateRange(startDate: string, endDate: string | null): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };
  const start = new Date(startDate + "T00:00:00");
  const startLabel = start.toLocaleDateString("en-GB", opts);
  if (!endDate || endDate === startDate) return startLabel;
  const end = new Date(endDate + "T00:00:00");
  const endLabel = end.toLocaleDateString("en-GB", opts);
  return `${startLabel} – ${endLabel}`;
}

function formatShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const EMPTY_ADD_FORM = {
  title: "",
  tag: "event" as EventTag,
  startDate: todayISO(),
  endDate: "",
  description: "",
  link: "",
};

// ---- Month-grid layout: builds week rows, then packs each week's events
// into "bars" spanning the day-columns they cover (clamped to that week),
// stacked into non-overlapping lanes — the same idea Google Calendar's
// month view uses, so a 4-day conference reads as one bar, not four dots.
type DayCell = { day: number; iso: string } | null;
type Week = { cells: DayCell[] };

// Always exactly 6 week rows (padding with a blank trailing week if the
// month only needs 5), the way Google Calendar's month view does — so the
// grid's total height never shifts between a "short" and a "long" month.
const WEEKS_PER_GRID = 6;

function buildWeeks(year: number, month: number): Week[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday-start
  const weeks: Week[] = [];
  let cells: DayCell[] = new Array(startOffset).fill(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, iso: isoFor(year, month, day) });
    if (cells.length === 7) {
      weeks.push({ cells });
      cells = [];
    }
  }
  if (cells.length) {
    while (cells.length < 7) cells.push(null);
    weeks.push({ cells });
  }
  while (weeks.length < WEEKS_PER_GRID) {
    weeks.push({ cells: new Array(7).fill(null) });
  }
  return weeks;
}

type Bar = { event: CalendarEvent; startCol: number; endCol: number; lane: number };

// Fixed at 2 so every week reserves exactly the same height: a header row,
// 2 bar lanes, and one more row that's either blank or a "+N more" — never
// taller just because that particular week happens to be busy.
const MAX_LANES_PER_WEEK = 2;

function layoutWeek(week: Week, events: CalendarEvent[]): { bars: Bar[]; overflowCount: number } {
  const real = week.cells.filter((c): c is { day: number; iso: string } => c !== null);
  if (!real.length) return { bars: [], overflowCount: 0 };
  const weekStartIso = real[0].iso;
  const weekEndIso = real[real.length - 1].iso;

  const overlapping = events.filter((ev) => {
    const evEnd = ev.endDate || ev.startDate;
    return ev.startDate <= weekEndIso && evEnd >= weekStartIso;
  });

  const withCols = overlapping.map((ev) => {
    const evEnd = ev.endDate || ev.startDate;
    let startCol = week.cells.findIndex((c) => c && c.iso >= ev.startDate);
    if (startCol === -1) startCol = 0;
    let endCol = -1;
    for (let i = 0; i < 7; i++) {
      const c = week.cells[i];
      if (c && c.iso <= evEnd) endCol = i;
    }
    if (endCol === -1) endCol = startCol;
    return { event: ev, startCol, endCol };
  });

  // Earliest-starting first; among ties, longer bars first (claim lanes before short ones).
  withCols.sort((a, b) => a.startCol - b.startCol || b.endCol - b.startCol - (a.endCol - a.startCol));

  const laneEndCols: number[] = [];
  const bars: Bar[] = [];
  let overflowCount = 0;
  for (const item of withCols) {
    let lane = laneEndCols.findIndex((end) => end < item.startCol);
    if (lane === -1) {
      if (laneEndCols.length >= MAX_LANES_PER_WEEK) {
        overflowCount++;
        continue;
      }
      lane = laneEndCols.length;
      laneEndCols.push(item.endCol);
    } else {
      laneEndCols[lane] = item.endCol;
    }
    bars.push({ ...item, lane });
  }
  return { bars, overflowCount };
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed

  const [modalEvent, setModalEvent] = useState<CalendarEvent | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(EMPTY_ADD_FORM);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [scans, setScans] = useState<Record<ScanKind, ScanState>>({
    event: EMPTY_SCAN,
    earnings: EMPTY_SCAN,
    holiday: EMPTY_SCAN,
  });
  const [activeScanPanel, setActiveScanPanel] = useState<ScanKind | null>(null);
  const [scanPanelCollapsed, setScanPanelCollapsed] = useState(false);
  const abortRefs = useRef<Record<ScanKind, AbortController | null>>({
    event: null,
    earnings: null,
    holiday: null,
  });
  const [scanMenuOpen, setScanMenuOpen] = useState(false);
  const [customizeKind, setCustomizeKind] = useState<"event" | "earnings" | null>(null);
  const [customizeText, setCustomizeText] = useState("");
  const anyScanLoading = scans.event.loading || scans.earnings.loading || scans.holiday.loading;
  const loadingScanKind = (["event", "earnings", "holiday"] as ScanKind[]).find((k) => scans[k].loading) ?? null;

  async function loadEvents() {
    setLoadingEvents(true);
    setListError(null);
    try {
      const res = await fetch("/api/events");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not load the calendar.");
      setEvents(data.events as CalendarEvent[]);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Could not load the calendar.");
    } finally {
      setLoadingEvents(false);
    }
  }

  useEffect(() => {
    loadEvents();
  }, []);

  function goToMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  }

  const weeks = useMemo(() => buildWeeks(viewYear, viewMonth), [viewYear, viewMonth]);
  const weekLayouts = useMemo(() => weeks.map((w) => layoutWeek(w, events)), [weeks, events]);

  const upcoming = useMemo(() => {
    const t = todayISO();
    return events
      .filter((ev) => (ev.endDate || ev.startDate) >= t)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [events]);

  function openAddForm() {
    setAddForm({ ...EMPTY_ADD_FORM, startDate: todayISO() });
    setAddError(null);
    setShowAddForm(true);
  }

  async function submitAddForm(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm.title.trim() || !addForm.startDate) {
      setAddError("An event needs at least a title and a start date.");
      return;
    }
    setAddSaving(true);
    setAddError(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: addForm.title.trim(),
          tag: addForm.tag,
          startDate: addForm.startDate,
          endDate: addForm.endDate || undefined,
          description: addForm.description.trim(),
          link: addForm.link.trim() || undefined,
          source: "manual",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not save the event.");
      setEvents((cur) => [...cur, data.event as CalendarEvent]);
      setShowAddForm(false);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Could not save the event.");
    } finally {
      setAddSaving(false);
    }
  }

  function closeModal() {
    setModalEvent(null);
    setIsEditing(false);
  }

  async function deleteEvent(id: string) {
    try {
      const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Could not delete the event.");
      }
      setEvents((cur) => cur.filter((e) => e.id !== id));
      closeModal();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not delete the event.");
    }
  }

  function startEdit() {
    if (!modalEvent) return;
    setEditForm({
      title: modalEvent.title,
      tag: modalEvent.tag,
      startDate: modalEvent.startDate,
      endDate: modalEvent.endDate || "",
      description: modalEvent.description,
      link: modalEvent.link || "",
    });
    setEditError(null);
    setIsEditing(true);
  }

  async function submitEditForm(e: React.FormEvent) {
    e.preventDefault();
    if (!modalEvent) return;
    if (!editForm.title.trim() || !editForm.startDate) {
      setEditError("An event needs at least a title and a start date.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/events/${modalEvent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editForm.title.trim(),
          tag: editForm.tag,
          startDate: editForm.startDate,
          endDate: editForm.endDate || undefined,
          description: editForm.description.trim(),
          link: editForm.link.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not save changes.");
      const updated = data.event as CalendarEvent;
      setEvents((cur) => cur.map((ev) => (ev.id === updated.id ? updated : ev)));
      setModalEvent(updated);
      setIsEditing(false);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Could not save changes.");
    } finally {
      setEditSaving(false);
    }
  }

  async function runScan(kind: ScanKind, focus = "") {
    const controller = new AbortController();
    abortRefs.current[kind] = controller;
    setScans((s) => ({ ...s, [kind]: { ...EMPTY_SCAN, loading: true } }));
    setActiveScanPanel(kind);
    setScanPanelCollapsed(false);
    try {
      const res = await fetch(SCAN_CONFIG[kind].url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focus }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "The scan failed.");
      setScans((s) => ({
        ...s,
        [kind]: {
          loading: false,
          candidates: data.candidates as ScanCandidate[],
          addedKeys: new Set(),
          error: null,
          windowEndISO: data.windowEndISO,
        },
      }));
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        // User pressed Stop — quietly reset, no error banner.
        setScans((s) => ({ ...s, [kind]: EMPTY_SCAN }));
        setActiveScanPanel(null);
        return;
      }
      setScans((s) => ({
        ...s,
        [kind]: { ...EMPTY_SCAN, error: e instanceof Error ? e.message : "The scan failed." },
      }));
    } finally {
      abortRefs.current[kind] = null;
    }
  }

  function stopScan(kind: ScanKind) {
    abortRefs.current[kind]?.abort();
  }

  async function addCandidate(kind: ScanKind, candidate: ScanCandidate) {
    const key = candidate.title + candidate.startDate;
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: candidate.title,
          tag: SCAN_CONFIG[kind].tag,
          startDate: candidate.startDate,
          endDate: candidate.endDate || undefined,
          description: candidate.description,
          link: candidate.link || undefined,
          source: "ai-scan",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not add that event.");
      setEvents((cur) => [...cur, data.event as CalendarEvent]);
      setScans((s) => ({
        ...s,
        [kind]: { ...s[kind], addedKeys: new Set(s[kind].addedKeys).add(key) },
      }));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not add that event.");
    }
  }

  const todayIsoStr = todayISO();

  return (
    <>
      <Masthead />

      <main>
        <div className="action-row">
          <button className="action btn-ghost" onClick={openAddForm}>
            + Add event
          </button>
          <div className="scan-menu-wrap">
            {anyScanLoading ? (
              <button className="action btn-secondary" onClick={() => loadingScanKind && stopScan(loadingScanKind)}>
                ⏹ Stop scan
              </button>
            ) : (
              <button className="action btn-secondary" onClick={() => setScanMenuOpen((o) => !o)}>
                🔍 Scan…
              </button>
            )}
            {scanMenuOpen && !anyScanLoading && (
              <>
                <div className="scan-menu-backdrop" onClick={() => setScanMenuOpen(false)} />
                <div className="scan-menu">
                  <button
                    onClick={() => {
                      setScanMenuOpen(false);
                      setCustomizeText("");
                      setCustomizeKind("event");
                    }}
                  >
                    🔍 Scan insurance events
                  </button>
                  <button
                    onClick={() => {
                      setScanMenuOpen(false);
                      setCustomizeText("");
                      setCustomizeKind("earnings");
                    }}
                  >
                    🔍 Scan earnings calendar
                  </button>
                  <button
                    onClick={() => {
                      setScanMenuOpen(false);
                      runScan("holiday");
                    }}
                  >
                    📅 Add UK bank holidays
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {activeScanPanel &&
          (() => {
            const kind = activeScanPanel;
            const st = scans[kind];
            if (st.loading) {
              return (
                <div className={`scan-panel scan-panel-${kind}`}>
                  <PastaLoader label={SCAN_CONFIG[kind].loadingLabel} />
                </div>
              );
            }
            if (!st.candidates && !st.error) return null;

            const title = st.error
              ? "Scan failed"
              : st.candidates!.length === 0
              ? "Nothing new found"
              : `Found ${st.candidates!.length} new item${st.candidates!.length === 1 ? "" : "s"}`;

            function dismiss() {
              setActiveScanPanel(null);
              setScanPanelCollapsed(false);
            }

            return (
              <div className={`scan-panel scan-panel-${kind}`}>
                <div className="scan-panel-head">
                  <h3>{title}</h3>
                  <div className="scan-panel-controls">
                    {!st.error && (
                      <button
                        className="scan-panel-btn"
                        onClick={() => setScanPanelCollapsed((c) => !c)}
                        aria-label={scanPanelCollapsed ? "Expand results" : "Minimize results"}
                        title={scanPanelCollapsed ? "Expand" : "Minimize — done reviewing, get it out of the way"}
                      >
                        {scanPanelCollapsed ? "▸" : "▾"}
                      </button>
                    )}
                    <button className="scan-panel-btn" onClick={dismiss} aria-label="Dismiss">
                      ✕
                    </button>
                  </div>
                </div>
                {!scanPanelCollapsed &&
                  (st.error ? (
                    <p className="scan-note">{st.error}</p>
                  ) : (
                    <>
                      <p className="scan-note">
                        {kind === "earnings" &&
                          `Only covers ${formatDateRange(todayIsoStr, st.windowEndISO || todayIsoStr)} — nothing further out shows here. `}
                        Already-added items are left out automatically.
                      </p>
                      {st.candidates!.map((c) => {
                        const key = c.title + c.startDate;
                        const added = st.addedKeys.has(key);
                        return (
                          <div className="scan-result" key={key}>
                            <div className="info">
                              <strong>{c.title}</strong>{" "}
                              <span className="d">
                                — {formatDateRange(c.startDate, c.endDate)}
                                {c.location ? `, ${c.location}` : ""}
                              </span>
                              {c.description && <div className="desc">{c.description}</div>}
                            </div>
                            <button
                              className="add-btn"
                              disabled={added}
                              onClick={() => addCandidate(kind, c)}
                              aria-label={`Add ${c.title} to the calendar`}
                            >
                              {added ? "✓" : "+"}
                            </button>
                          </div>
                        );
                      })}
                    </>
                  ))}
              </div>
            );
          })()}

        {listError && <div className="error-banner">{listError}</div>}

        <section className="cal-workspace">
          <div className="pane">
            <div className="pane-head">
              <h2>
                {MONTH_NAMES[viewMonth]} {viewYear}
              </h2>
              <div className="month-nav">
                <button onClick={() => goToMonth(-1)} aria-label="Previous month">
                  ‹
                </button>
                shared calendar
                <button onClick={() => goToMonth(1)} aria-label="Next month">
                  ›
                </button>
              </div>
            </div>
            <div className="cal-grid">
              <div className="cal-weekdays">
                {WEEKDAY_LABELS.map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>
              {weeks.map((week, wi) => {
                const { bars, overflowCount } = weekLayouts[wi];
                return (
                  <div key={wi} className="cal-week">
                    {week.cells.map((c, ci) => (
                      <div
                        key={ci}
                        className={`cal-daynum${c ? "" : " empty"}${c && c.iso === todayIsoStr ? " today" : ""}`}
                        style={{ gridColumn: ci + 1, gridRow: 1 }}
                      >
                        {c ? c.day : ""}
                      </div>
                    ))}
                    {bars.map((b) => (
                      <div
                        key={b.event.id}
                        className={`cal-bar ${b.event.tag}`}
                        style={{ gridColumn: `${b.startCol + 1} / ${b.endCol + 2}`, gridRow: b.lane + 2 }}
                        title={b.event.title}
                        onClick={() => setModalEvent(b.event)}
                      >
                        {b.event.title}
                      </div>
                    ))}
                    {overflowCount > 0 && (
                      <div className="cal-bar-overflow" style={{ gridColumn: "1 / 8", gridRow: MAX_LANES_PER_WEEK + 2 }}>
                        +{overflowCount} more this week
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="cal-legend">
              <span>
                <span className="dot event" /> Industry event
              </span>
              <span>
                <span className="dot earnings" /> Earnings
              </span>
              <span>
                <span className="dot editorial" /> Editorial
              </span>
              <span>
                <span className="dot holiday" /> Bank Holiday
              </span>
            </div>
          </div>

          <div className="pane">
            <div className="pane-head">
              <h2>Upcoming</h2>
              <span style={{ fontSize: ".8rem", color: "var(--ink-soft)", fontStyle: "italic" }}>
                {loadingEvents ? "Loading…" : `${upcoming.length} event${upcoming.length === 1 ? "" : "s"}`}
              </span>
            </div>
            <ul className="event-list">
              {!loadingEvents && upcoming.length === 0 && (
                <p className="empty-hint" style={{ padding: "0 4px" }}>
                  Nothing upcoming yet — add one or run a scan.
                </p>
              )}
              {upcoming.map((ev) => (
                <li className="event-card" key={ev.id} onClick={() => setModalEvent(ev)}>
                  <div className="row1">
                    <span className="title">{ev.title}</span>
                    <span className="date">{formatShort(ev.startDate)}</span>
                  </div>
                  <span className={`tag-pill ${ev.tag}`}>{TAG_LABELS[ev.tag]}</span>
                  {ev.description && <div className="desc">{ev.description}</div>}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      {modalEvent && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal">
            {isEditing ? (
              <>
                <h3>Edit event</h3>
                <form className="event-form" onSubmit={submitEditForm}>
                  {editError && <div className="error-banner">{editError}</div>}
                  <label>
                    Title
                    <input
                      type="text"
                      value={editForm.title}
                      onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                      required
                    />
                  </label>
                  <label>
                    Tag
                    <select
                      value={editForm.tag}
                      onChange={(e) => setEditForm((f) => ({ ...f, tag: e.target.value as EventTag }))}
                    >
                      {EVENT_TAGS.map((t) => (
                        <option key={t} value={t}>
                          {TAG_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="form-row">
                    <label>
                      Start date
                      <input
                        type="date"
                        value={editForm.startDate}
                        onChange={(e) => setEditForm((f) => ({ ...f, startDate: e.target.value }))}
                        required
                      />
                    </label>
                    <label>
                      End date (optional)
                      <input
                        type="date"
                        value={editForm.endDate}
                        onChange={(e) => setEditForm((f) => ({ ...f, endDate: e.target.value }))}
                      />
                    </label>
                  </div>
                  <label>
                    Description
                    <textarea
                      value={editForm.description}
                      onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                    />
                  </label>
                  <label>
                    Link (optional)
                    <input
                      type="url"
                      placeholder="https://…"
                      value={editForm.link}
                      onChange={(e) => setEditForm((f) => ({ ...f, link: e.target.value }))}
                    />
                  </label>
                  <div className="modal-actions">
                    <button
                      type="button"
                      className="action btn-ghost"
                      onClick={() => setIsEditing(false)}
                      disabled={editSaving}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="action btn-primary" disabled={editSaving}>
                      {editSaving ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <h3>{modalEvent.title}</h3>
                <div className="date">{formatDateRange(modalEvent.startDate, modalEvent.endDate)}</div>
                <span className={`tag-pill ${modalEvent.tag}`} style={{ marginBottom: 10 }}>
                  {TAG_LABELS[modalEvent.tag]}
                </span>
                {modalEvent.description && <p>{modalEvent.description}</p>}
                {modalEvent.link && (
                  <p>
                    <a href={modalEvent.link} target="_blank" rel="noopener noreferrer">
                      View source →
                    </a>
                  </p>
                )}
                <div className="modal-actions">
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="action btn-ghost" onClick={startEdit}>
                      Edit
                    </button>
                    <button className="action btn-ghost" onClick={() => downloadIcs(modalEvent)}>
                      Export .ics
                    </button>
                    <button className="action btn-ghost" onClick={closeModal}>
                      Close
                    </button>
                  </div>
                  <button className="action btn-danger" onClick={() => deleteEvent(modalEvent.id)}>
                    Delete event
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {customizeKind && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setCustomizeKind(null)}>
          <div className="modal">
            <h3>{customizeKind === "event" ? "Scan insurance events" : "Scan earnings calendar"}</h3>
            <p style={{ fontSize: ".88rem", color: "var(--ink-soft)", marginTop: 0 }}>
              Anything specific to focus on? Optional — a company, a region, a country, a topic. Leave blank for a
              general scan.
            </p>
            <textarea
              value={customizeText}
              onChange={(e) => setCustomizeText(e.target.value)}
              placeholder={
                customizeKind === "event"
                  ? "e.g. events in Japan, or focused on cyber insurance"
                  : "e.g. only Lloyd's syndicates"
              }
              style={{
                width: "100%",
                minHeight: 70,
                fontFamily: "inherit",
                fontSize: ".95rem",
                padding: "8px 10px",
                border: "1px solid var(--line)",
                borderRadius: 3,
                background: "var(--paper)",
                color: "var(--ink)",
              }}
            />
            <div className="modal-actions">
              <button className="action btn-ghost" onClick={() => setCustomizeKind(null)}>
                Cancel
              </button>
              <button
                className="action btn-primary"
                onClick={() => {
                  const kind = customizeKind;
                  const focus = customizeText;
                  setCustomizeKind(null);
                  runScan(kind, focus);
                }}
              >
                Run scan
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddForm && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && !addSaving && setShowAddForm(false)}
        >
          <div className="modal">
            <h3>Add event</h3>
            <form className="event-form" onSubmit={submitAddForm}>
              {addError && <div className="error-banner">{addError}</div>}
              <label>
                Title
                <input
                  type="text"
                  value={addForm.title}
                  onChange={(e) => setAddForm((f) => ({ ...f, title: e.target.value }))}
                  required
                />
              </label>
              <label>
                Tag
                <select
                  value={addForm.tag}
                  onChange={(e) => setAddForm((f) => ({ ...f, tag: e.target.value as EventTag }))}
                >
                  {EVENT_TAGS.map((t) => (
                    <option key={t} value={t}>
                      {TAG_LABELS[t]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-row">
                <label>
                  Start date
                  <input
                    type="date"
                    value={addForm.startDate}
                    onChange={(e) => setAddForm((f) => ({ ...f, startDate: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  End date (optional)
                  <input
                    type="date"
                    value={addForm.endDate}
                    onChange={(e) => setAddForm((f) => ({ ...f, endDate: e.target.value }))}
                  />
                </label>
              </div>
              <label>
                Description (a sentence or two)
                <textarea
                  value={addForm.description}
                  onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
                />
              </label>
              <label>
                Link (optional)
                <input
                  type="url"
                  placeholder="https://…"
                  value={addForm.link}
                  onChange={(e) => setAddForm((f) => ({ ...f, link: e.target.value }))}
                />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="action btn-ghost"
                  onClick={() => setShowAddForm(false)}
                  disabled={addSaving}
                >
                  Cancel
                </button>
                <button type="submit" className="action btn-primary" disabled={addSaving}>
                  {addSaving ? "Adding…" : "Add event"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
