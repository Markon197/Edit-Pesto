"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Masthead from "@/components/Masthead";
import PastaLoader from "@/components/PastaLoader";
import { downloadIcs } from "@/lib/ics";
import { fetchJson } from "@/lib/fetchJson";
import { EVENT_TAGS, TAG_LABELS, type CalendarEvent, type EventTag } from "@/lib/events";

type ScanCandidate = {
  title: string;
  startDate: string;
  endDate: string | null;
  time: string | null;
  location: string | null;
  description: string;
  link: string | null;
  // Only set by "import" — the other scans use a fixed tag for the whole
  // batch (SCAN_CONFIG[kind].tag) since each one only ever produces one
  // kind of event, but imported text can be a mix.
  tag?: EventTag;
};

type ScanKind = "event" | "earnings" | "holiday" | "import";

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
  import: {
    url: "/api/import",
    // Unused fallback — import candidates carry their own tag, guessed
    // per item, since pasted text can mix event types.
    tag: "event",
    buttonLabel: "📋 Import events",
    loadingLabel: "Reading through what you pasted…",
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

// "14:00" -> "2pm", "09:30" -> "9:30am" — compact editorial style rather
// than a full HH:MM:SS clock face.
function formatTime(time: string): string {
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  const period = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return mStr === "00" ? `${h12}${period}` : `${h12}:${mStr}${period}`;
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
  time: "",
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

// ---- Week view: a simple day-by-day agenda (not an hour-grid) so every
// event on a busy day is readable at a glance, times and all, rather than
// squeezed into a fixed-height lane bar.
//
// Deliberately all-UTC, not local time: parsing "T00:00:00" (local) and then
// reading it back via toISOString() (UTC) silently shifts the date by a day
// for anyone in a positive UTC offset — UK included, whenever BST is in
// effect. mondayOf() re-snaps to Monday on every call using that same drift,
// so the error compounded click over click and could make "next week" loop
// in place instead of advancing. Staying in UTC start-to-finish sidesteps
// it entirely — same fix already used in lib/ics.ts's dayAfter().
function addDays(iso: string, delta: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function mondayOf(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const offset = (d.getUTCDay() + 6) % 7; // Monday-start
  return addDays(iso, -offset);
}

function weekDatesFrom(mondayIso: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayIso, i));
}

function formatWeekRange(startIso: string, endIso: string): string {
  const start = new Date(startIso + "T00:00:00");
  const end = new Date(endIso + "T00:00:00");
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const startLabel = start.toLocaleDateString("en-GB", { day: "numeric", month: sameMonth ? undefined : "short" });
  const endLabel = end.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${startLabel} – ${endLabel}`;
}

type Bar = { event: CalendarEvent; startCol: number; endCol: number; lane: number };

// Fixed at 3 so every week reserves exactly the same height: a header row,
// 3 bar lanes, and one more row that's either blank or a "+N more" — never
// taller just because that particular week happens to be busy.
const MAX_LANES_PER_WEEK = 3;

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

  // The Upcoming pane is capped to the calendar pane's actual rendered
  // height and scrolls internally, rather than growing to fit every event.
  // This can't be done with CSS alone: a plain "stretch" grid row sizes
  // itself to the tallest item's natural content height, and an
  // overflow-y:auto list still counts as "tall" for that purpose — so both
  // panes just ballooned together to fit all events instead of one of them
  // scrolling. Measuring the calendar pane directly sidesteps that.
  const calPaneRef = useRef<HTMLDivElement>(null);
  const [calHeight, setCalHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!calPaneRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setCalHeight(entry.contentRect.height);
    });
    ro.observe(calPaneRef.current);
    return () => ro.disconnect();
  }, []);

  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed

  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [weekAnchor, setWeekAnchor] = useState(todayISO()); // any date within the shown week

  const [modalEvent, setModalEvent] = useState<CalendarEvent | null>(null);
  const [showAllEvents, setShowAllEvents] = useState(false);
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
    import: EMPTY_SCAN,
  });
  const [activeScanPanel, setActiveScanPanel] = useState<ScanKind | null>(null);
  const [scanPanelCollapsed, setScanPanelCollapsed] = useState(false);
  const abortRefs = useRef<Record<ScanKind, AbortController | null>>({
    event: null,
    earnings: null,
    holiday: null,
    import: null,
  });
  const [scanMenuOpen, setScanMenuOpen] = useState(false);
  const [customizeKind, setCustomizeKind] = useState<"event" | "earnings" | null>(null);
  const [customizeText, setCustomizeText] = useState("");
  const [showImportForm, setShowImportForm] = useState(false);
  const [importText, setImportText] = useState("");
  const ALL_SCAN_KINDS = ["event", "earnings", "holiday", "import"] as ScanKind[];
  const anyScanLoading = ALL_SCAN_KINDS.some((k) => scans[k].loading);
  const loadingScanKind = ALL_SCAN_KINDS.find((k) => scans[k].loading) ?? null;

  async function loadEvents() {
    setLoadingEvents(true);
    setListError(null);
    try {
      const data = await fetchJson("/api/events");
      setEvents(Array.isArray(data.events) ? (data.events as CalendarEvent[]) : []);
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

  function goToWeek(delta: number) {
    setWeekAnchor((cur) => addDays(mondayOf(cur), delta * 7));
  }

  function switchToWeek() {
    // Land on the current week if we're looking at the current month;
    // otherwise the first week of whatever month is on screen.
    const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();
    setWeekAnchor(isCurrentMonth ? todayISO() : isoFor(viewYear, viewMonth, 1));
    setViewMode("week");
  }

  function switchToMonth() {
    const d = new Date(weekStart + "T00:00:00");
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setViewMode("month");
  }

  const weeks = useMemo(() => buildWeeks(viewYear, viewMonth), [viewYear, viewMonth]);
  const weekLayouts = useMemo(() => weeks.map((w) => layoutWeek(w, events)), [weeks, events]);

  const weekStart = useMemo(() => mondayOf(weekAnchor), [weekAnchor]);
  const weekDates = useMemo(() => weekDatesFrom(weekStart), [weekStart]);
  const weekAgenda = useMemo(
    () =>
      weekDates.map((iso) => ({
        iso,
        events: events
          .filter((ev) => ev.startDate <= iso && (ev.endDate || ev.startDate) >= iso)
          .sort((a, b) => {
            if (!a.time && !b.time) return a.title.localeCompare(b.title);
            if (!a.time) return -1;
            if (!b.time) return 1;
            return a.time.localeCompare(b.time) || a.title.localeCompare(b.title);
          }),
      })),
    [weekDates, events]
  );

  const upcoming = useMemo(() => {
    const t = todayISO();
    return events
      .filter((ev) => (ev.endDate || ev.startDate) >= t)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [events]);

  const allEventsSorted = useMemo(
    () => [...events].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [events]
  );

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
      const data = await fetchJson("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: addForm.title.trim(),
          tag: addForm.tag,
          startDate: addForm.startDate,
          endDate: addForm.endDate || undefined,
          time: addForm.time || undefined,
          description: addForm.description.trim(),
          link: addForm.link.trim() || undefined,
          source: "manual",
        }),
      });
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
      await fetchJson(`/api/events/${id}`, { method: "DELETE" });
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
      time: modalEvent.time || "",
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
      const data = await fetchJson(`/api/events/${modalEvent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editForm.title.trim(),
          tag: editForm.tag,
          startDate: editForm.startDate,
          endDate: editForm.endDate || undefined,
          time: editForm.time || undefined,
          description: editForm.description.trim(),
          link: editForm.link.trim() || undefined,
        }),
      });
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
      const data = await fetchJson(SCAN_CONFIG[kind].url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focus }),
        signal: controller.signal,
      });
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

  // Separate from runScan because it posts pasted text, not a focus string,
  // and has no web_search step to worry about — but shares the same
  // scans/activeScanPanel state so results land in the same panel UI.
  async function runImport(text: string) {
    const kind: ScanKind = "import";
    const controller = new AbortController();
    abortRefs.current[kind] = controller;
    setScans((s) => ({ ...s, [kind]: { ...EMPTY_SCAN, loading: true } }));
    setActiveScanPanel(kind);
    setScanPanelCollapsed(false);
    try {
      const data = await fetchJson(SCAN_CONFIG[kind].url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      setScans((s) => ({
        ...s,
        [kind]: { loading: false, candidates: data.candidates as ScanCandidate[], addedKeys: new Set(), error: null },
      }));
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setScans((s) => ({ ...s, [kind]: EMPTY_SCAN }));
        setActiveScanPanel(null);
        return;
      }
      setScans((s) => ({
        ...s,
        [kind]: { ...EMPTY_SCAN, error: e instanceof Error ? e.message : "Could not process that text." },
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
      const data = await fetchJson("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: candidate.title,
          tag: candidate.tag ?? SCAN_CONFIG[kind].tag,
          startDate: candidate.startDate,
          endDate: candidate.endDate || undefined,
          time: candidate.time || undefined,
          description: candidate.description,
          link: candidate.link || undefined,
          source: "ai-scan",
        }),
      });
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
          <button
            className="action btn-ghost"
            onClick={() => {
              setImportText("");
              setShowImportForm(true);
            }}
            disabled={anyScanLoading}
          >
            📋 Import events
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
                      <div className="scan-results-list">
                        {st.candidates!.map((c) => {
                          const key = c.title + c.startDate;
                          const added = st.addedKeys.has(key);
                          return (
                            <div className="scan-result" key={key}>
                              <div className="info">
                                {c.tag && (
                                  <span className={`tag-pill ${c.tag}`} style={{ marginTop: 0, marginRight: 4 }}>
                                    {TAG_LABELS[c.tag]}
                                  </span>
                                )}
                                <strong>{c.title}</strong>{" "}
                                <span className="d">
                                  — {formatDateRange(c.startDate, c.endDate)}
                                  {c.time ? `, ${formatTime(c.time)}` : ""}
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
                      </div>
                    </>
                  ))}
              </div>
            );
          })()}

        {listError && <div className="error-banner">{listError}</div>}

        <section className="cal-workspace">
          <div className="pane" ref={calPaneRef}>
            <div className="pane-head cal-pane-head">
              <h2>
                {viewMode === "month"
                  ? `${MONTH_NAMES[viewMonth]} ${viewYear}`
                  : formatWeekRange(weekStart, weekDates[6])}
              </h2>
              <div className="cal-head-controls">
                <div className="view-toggle">
                  <button className={viewMode === "month" ? "active" : ""} onClick={switchToMonth}>
                    Month
                  </button>
                  <button className={viewMode === "week" ? "active" : ""} onClick={switchToWeek}>
                    Week
                  </button>
                </div>
                <div className="month-nav">
                  <button
                    onClick={() => (viewMode === "month" ? goToMonth(-1) : goToWeek(-1))}
                    aria-label={viewMode === "month" ? "Previous month" : "Previous week"}
                  >
                    ‹
                  </button>
                  shared calendar
                  <button
                    onClick={() => (viewMode === "month" ? goToMonth(1) : goToWeek(1))}
                    aria-label={viewMode === "month" ? "Next month" : "Next week"}
                  >
                    ›
                  </button>
                </div>
              </div>
            </div>
            {viewMode === "month" ? (
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
                          style={{ gridColumn: ci + 1, gridRow: "1 / -1" }}
                        >
                          {c ? c.day : ""}
                        </div>
                      ))}
                      {bars.map((b) => (
                        <div
                          key={b.event.id}
                          className={`cal-bar ${b.event.tag}`}
                          style={{ gridColumn: `${b.startCol + 1} / ${b.endCol + 2}`, gridRow: b.lane + 2 }}
                          title={b.event.time ? `${formatTime(b.event.time)} — ${b.event.title}` : b.event.title}
                          onClick={() => setModalEvent(b.event)}
                        >
                          {b.event.title}
                        </div>
                      ))}
                      {overflowCount > 0 && (
                        <div
                          className="cal-bar-overflow"
                          style={{ gridColumn: "1 / 8", gridRow: MAX_LANES_PER_WEEK + 2 }}
                          onClick={() => setShowAllEvents(true)}
                          title="See all events"
                        >
                          +{overflowCount} more this week
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="cal-grid week-agenda">
                {weekAgenda.map(({ iso, events: dayEvents }) => {
                  const d = new Date(iso + "T00:00:00");
                  const isToday = iso === todayIsoStr;
                  return (
                    <div className={`week-day${isToday ? " today" : ""}`} key={iso}>
                      <div className="week-day-head">
                        <span className="week-day-name">{d.toLocaleDateString("en-GB", { weekday: "long" })}</span>
                        <span className="week-day-date">
                          {d.getDate()} {MONTH_NAMES[d.getMonth()]}
                        </span>
                      </div>
                      {dayEvents.length === 0 ? (
                        <p className="empty-hint">Nothing this day</p>
                      ) : (
                        <ul className="event-list week-day-list">
                          {dayEvents.map((ev) => (
                            <li className="event-card" key={ev.id} onClick={() => setModalEvent(ev)}>
                              <div className="row1">
                                <span className="title">{ev.title}</span>
                                {ev.time && <span className="date">{formatTime(ev.time)}</span>}
                              </div>
                              <span className={`tag-pill ${ev.tag}`}>{TAG_LABELS[ev.tag]}</span>
                              {ev.description && <div className="desc">{ev.description}</div>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
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

          <div className="pane" style={calHeight ? { maxHeight: calHeight } : undefined}>
            <div className="pane-head">
              <h2>Upcoming</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: ".8rem", color: "var(--ink-soft)", fontStyle: "italic" }}>
                  {loadingEvents ? "Loading…" : `${upcoming.length} event${upcoming.length === 1 ? "" : "s"}`}
                </span>
                {events.length > 0 && (
                  <button className="icon-btn" onClick={() => setShowAllEvents(true)}>
                    See all
                  </button>
                )}
              </div>
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
                    <span className="date">
                      {formatShort(ev.startDate)}
                      {ev.time ? `, ${formatTime(ev.time)}` : ""}
                    </span>
                  </div>
                  <span className={`tag-pill ${ev.tag}`}>{TAG_LABELS[ev.tag]}</span>
                  {ev.description && <div className="desc">{ev.description}</div>}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      {showAllEvents && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowAllEvents(false)}>
          <div className="modal modal-wide">
            <h3>All events ({events.length})</h3>
            <ul className="event-list event-list-modal">
              {allEventsSorted.map((ev) => (
                <li
                  className="event-card"
                  key={ev.id}
                  onClick={() => {
                    setShowAllEvents(false);
                    setModalEvent(ev);
                  }}
                >
                  <div className="row1">
                    <span className="title">{ev.title}</span>
                    <span className="date">
                      {formatShort(ev.startDate)}
                      {ev.time ? `, ${formatTime(ev.time)}` : ""}
                    </span>
                  </div>
                  <span className={`tag-pill ${ev.tag}`}>{TAG_LABELS[ev.tag]}</span>
                  {ev.description && <div className="desc">{ev.description}</div>}
                </li>
              ))}
            </ul>
            <div className="modal-actions">
              <button className="action btn-ghost" onClick={() => setShowAllEvents(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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
                  <label className="label-narrow">
                    Time (optional)
                    <input
                      type="time"
                      value={editForm.time}
                      onChange={(e) => setEditForm((f) => ({ ...f, time: e.target.value }))}
                    />
                  </label>
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
                <div className="date">
                  {formatDateRange(modalEvent.startDate, modalEvent.endDate)}
                  {modalEvent.time ? ` · ${formatTime(modalEvent.time)}` : ""}
                </div>
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

      {showImportForm && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setShowImportForm(false)}
        >
          <div className="modal modal-wide" style={{ maxWidth: 720 }}>
            <h3>Import events</h3>
            <p style={{ fontSize: ".88rem", color: "var(--ink-soft)", marginTop: 0 }}>
              Paste raw text — a press release, an AI-generated list, a copied schedule, rough notes — and it'll be
              read through and turned into proposed events you can review and add one by one, just like a scan's
              results.
            </p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Paste text here…"
              maxLength={60000}
              style={{
                width: "100%",
                minHeight: 440,
                fontFamily: "inherit",
                fontSize: ".9rem",
                padding: "8px 10px",
                border: "1px solid var(--line)",
                borderRadius: 3,
                background: "var(--paper)",
                color: "var(--ink)",
                resize: "vertical",
              }}
            />
            <div className="modal-actions">
              <button className="action btn-ghost" onClick={() => setShowImportForm(false)}>
                Cancel
              </button>
              <button
                className="action btn-primary"
                disabled={!importText.trim()}
                onClick={() => {
                  const text = importText;
                  setShowImportForm(false);
                  runImport(text);
                }}
              >
                Read &amp; propose events
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
              <label className="label-narrow">
                Time (optional)
                <input
                  type="time"
                  value={addForm.time}
                  onChange={(e) => setAddForm((f) => ({ ...f, time: e.target.value }))}
                />
              </label>
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
