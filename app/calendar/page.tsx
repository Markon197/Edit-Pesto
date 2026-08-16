"use client";

import { useEffect, useMemo, useState } from "react";
import Masthead from "@/components/Masthead";
import { EVENT_TAGS, TAG_LABELS, type CalendarEvent, type EventTag } from "@/lib/events";

type ScanCandidate = {
  title: string;
  startDate: string;
  endDate: string | null;
  location: string | null;
  description: string;
  link: string | null;
};

type ScanState = {
  loading: boolean;
  candidates: ScanCandidate[] | null;
  addedKeys: Set<string>;
  error: string | null;
  windowEndISO?: string;
};

const EMPTY_SCAN: ScanState = { loading: false, candidates: null, addedKeys: new Set(), error: null };

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

const EMPTY_ADD_FORM = {
  title: "",
  tag: "event" as EventTag,
  startDate: todayISO(),
  endDate: "",
  description: "",
  link: "",
};

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed

  const [modalEvent, setModalEvent] = useState<CalendarEvent | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [eventsScan, setEventsScan] = useState<ScanState>(EMPTY_SCAN);
  const [earningsScan, setEarningsScan] = useState<ScanState>(EMPTY_SCAN);
  const [activeScanPanel, setActiveScanPanel] = useState<"event" | "earnings" | null>(null);

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

  // Map each day-of-month in the current view to the tags of events
  // covering that day (start..end inclusive, or just the start day).
  const dayTags = useMemo(() => {
    const map = new Map<number, Set<EventTag>>();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    for (const ev of events) {
      for (let d = 1; d <= daysInMonth; d++) {
        const iso = isoFor(viewYear, viewMonth, d);
        const end = ev.endDate || ev.startDate;
        if (iso >= ev.startDate && iso <= end) {
          if (!map.has(d)) map.set(d, new Set());
          map.get(d)!.add(ev.tag);
        }
      }
    }
    return map;
  }, [events, viewYear, viewMonth]);

  function eventsOnDay(day: number): CalendarEvent[] {
    const iso = isoFor(viewYear, viewMonth, day);
    return events.filter((ev) => iso >= ev.startDate && iso <= (ev.endDate || ev.startDate));
  }

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

  async function deleteEvent(id: string) {
    try {
      const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Could not delete the event.");
      }
      setEvents((cur) => cur.filter((e) => e.id !== id));
      setModalEvent(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not delete the event.");
    }
  }

  async function runScan(kind: "event" | "earnings") {
    const setState = kind === "event" ? setEventsScan : setEarningsScan;
    setState({ ...EMPTY_SCAN, loading: true });
    setActiveScanPanel(kind);
    try {
      const res = await fetch(kind === "event" ? "/api/scan/events" : "/api/scan/earnings", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "The scan failed.");
      setState({
        loading: false,
        candidates: data.candidates as ScanCandidate[],
        addedKeys: new Set(),
        error: null,
        windowEndISO: data.windowEndISO,
      });
    } catch (e) {
      setState({
        loading: false,
        candidates: null,
        addedKeys: new Set(),
        error: e instanceof Error ? e.message : "The scan failed.",
      });
    }
  }

  async function addCandidate(kind: "event" | "earnings", candidate: ScanCandidate) {
    const key = candidate.title + candidate.startDate;
    const setState = kind === "event" ? setEventsScan : setEarningsScan;
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: candidate.title,
          tag: kind,
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
      setState((cur) => ({ ...cur, addedKeys: new Set(cur.addedKeys).add(key) }));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not add that event.");
    }
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // Monday-start week
  const todayIsoStr = todayISO();

  return (
    <>
      <Masthead />

      <main>
        <div className="action-row">
          <button className="action btn-ghost" onClick={openAddForm}>
            + Add event
          </button>
          <button className="action btn-secondary" onClick={() => runScan("event")} disabled={eventsScan.loading}>
            {eventsScan.loading ? "Scanning…" : "🔍 Scan insurance events"}
          </button>
          <button
            className="action btn-secondary"
            onClick={() => runScan("earnings")}
            disabled={earningsScan.loading}
          >
            {earningsScan.loading ? "Scanning…" : "🔍 Scan earnings calendar"}
          </button>
        </div>

        {activeScanPanel === "event" && (eventsScan.candidates || eventsScan.error) && (
          <div className="scan-panel">
            {eventsScan.error ? (
              <p className="scan-note">{eventsScan.error}</p>
            ) : (
              <>
                <h3>
                  {eventsScan.candidates!.length === 0
                    ? "No new industry events found"
                    : `Found ${eventsScan.candidates!.length} upcoming industry event${
                        eventsScan.candidates!.length === 1 ? "" : "s"
                      }`}
                </h3>
                <p className="scan-note">Events already on your calendar are left out automatically.</p>
                {eventsScan.candidates!.map((c) => {
                  const key = c.title + c.startDate;
                  const added = eventsScan.addedKeys.has(key);
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
                        onClick={() => addCandidate("event", c)}
                        aria-label={`Add ${c.title} to the calendar`}
                      >
                        {added ? "✓" : "+"}
                      </button>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {activeScanPanel === "earnings" && (earningsScan.candidates || earningsScan.error) && (
          <div className="scan-panel">
            {earningsScan.error ? (
              <p className="scan-note">{earningsScan.error}</p>
            ) : (
              <>
                <h3>
                  {earningsScan.candidates!.length === 0
                    ? "No qualifying earnings in the next two weeks"
                    : `Insurance earnings in the next two weeks (${earningsScan.candidates!.length})`}
                </h3>
                <p className="scan-note">
                  Only covers {formatDateRange(todayIsoStr, earningsScan.windowEndISO || todayIsoStr)} — nothing
                  further out shows here. Already-added companies are left out automatically.
                </p>
                {earningsScan.candidates!.map((c) => {
                  const key = c.title + c.startDate;
                  const added = earningsScan.addedKeys.has(key);
                  return (
                    <div className="scan-result" key={key}>
                      <div className="info">
                        <strong>{c.title}</strong> <span className="d">— {formatShort(c.startDate)}</span>
                        {c.description && <div className="desc">{c.description}</div>}
                      </div>
                      <button
                        className="add-btn"
                        disabled={added}
                        onClick={() => addCandidate("earnings", c)}
                        aria-label={`Add ${c.title} to the calendar`}
                      >
                        {added ? "✓" : "+"}
                      </button>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

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
                <div>Mon</div>
                <div>Tue</div>
                <div>Wed</div>
                <div>Thu</div>
                <div>Fri</div>
                <div>Sat</div>
                <div>Sun</div>
              </div>
              <div className="cal-days">
                {Array.from({ length: startOffset }).map((_, i) => (
                  <div className="cal-day empty" key={`e${i}`} />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const tags = dayTags.get(day);
                  const iso = isoFor(viewYear, viewMonth, day);
                  const isToday = iso === todayIsoStr;
                  return (
                    <div
                      key={day}
                      className={`cal-day${tags ? " has-event" : ""}${isToday ? " today" : ""}`}
                      onClick={() => {
                        const dayEvents = eventsOnDay(day);
                        if (dayEvents.length) setModalEvent(dayEvents[0]);
                      }}
                    >
                      {day}
                      {tags && (
                        <div className="dots">
                          {Array.from(tags).map((t) => (
                            <span className={`dot ${t}`} key={t} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setModalEvent(null)}>
          <div className="modal">
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
              <button className="action btn-ghost" onClick={() => setModalEvent(null)}>
                Close
              </button>
              <button className="action btn-danger" onClick={() => deleteEvent(modalEvent.id)}>
                Delete event
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
