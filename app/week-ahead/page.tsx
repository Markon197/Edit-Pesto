"use client";

import { useEffect, useMemo, useState } from "react";
import Masthead from "@/components/Masthead";
import { fetchJson } from "@/lib/fetchJson";
import type { CalendarEvent } from "@/lib/events";
import type { TagDef } from "@/lib/tags";

type WeekAheadEvent = CalendarEvent & {
  note: string | null;
  hidden: boolean;
  sortOrder: number | null;
};

function formatShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function formatWeekLabel(startIso: string, endIso: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };
  const start = new Date(startIso + "T00:00:00");
  const end = new Date(endIso + "T00:00:00");
  const startLabel = start.toLocaleDateString("en-GB", opts);
  const endLabel = end.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return `${startLabel} – ${endLabel}`;
}

export default function WeekAheadPage() {
  const [events, setEvents] = useState<WeekAheadEvent[]>([]);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [weekEnd, setWeekEnd] = useState<string | null>(null);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [tags, setTags] = useState<TagDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");
  // A set, not a single id — moveEvent() saves two events at once (the
  // swap), and a single "currently saving" id can only ever reflect one of
  // them, letting the other's buttons stay clickable mid-save.
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const [subEmail, setSubEmail] = useState("");
  const [subName, setSubName] = useState("");
  const [subSaving, setSubSaving] = useState(false);
  const [subDone, setSubDone] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [weekData, tagData] = await Promise.all([fetchJson("/api/week-ahead"), fetchJson("/api/tags")]);
      setWeekStart(weekData.weekStart);
      setWeekEnd(weekData.weekEnd);
      setSubscriberCount(weekData.subscriberCount ?? 0);
      setEvents(Array.isArray(weekData.events) ? weekData.events : []);
      setTags(Array.isArray(tagData.tags) ? tagData.tags : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Week Ahead.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function resolveTag(tagId: string): TagDef {
    return (
      tags.find((t) => t.id === tagId) ?? {
        id: tagId,
        label: tagId,
        color: "slate",
        highlight: false,
        sortOrder: 999,
      }
    );
  }
  function tagPillClass(t: TagDef): string {
    return `tag-pill color-${t.color}${t.highlight ? " tag-highlight" : ""}`;
  }

  const visible = useMemo(() => events.filter((e) => !e.hidden), [events]);
  const hidden = useMemo(() => events.filter((e) => e.hidden), [events]);

  async function saveOverride(ev: WeekAheadEvent, patch: Partial<Pick<WeekAheadEvent, "note" | "hidden" | "sortOrder">>) {
    setSavingIds((cur) => new Set(cur).add(ev.id));
    try {
      const payload = {
        note: patch.note !== undefined ? patch.note : ev.note,
        hidden: patch.hidden !== undefined ? patch.hidden : ev.hidden,
        sortOrder: patch.sortOrder !== undefined ? patch.sortOrder : ev.sortOrder,
      };
      await fetchJson(`/api/week-ahead/notes/${ev.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setEvents((cur) => cur.map((e) => (e.id === ev.id ? { ...e, ...payload } : e)));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not save that change.");
    } finally {
      setSavingIds((cur) => {
        const next = new Set(cur);
        next.delete(ev.id);
        return next;
      });
    }
  }

  function startEdit(ev: WeekAheadEvent) {
    setEditingId(ev.id);
    setEditNote(ev.note ?? ev.description);
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    const ev = events.find((x) => x.id === editingId);
    if (!ev) return;
    await saveOverride(ev, { note: editNote.trim() || null });
    setEditingId(null);
  }

  // Reordering assigns real sort_order values on first use — before that,
  // every event is implicitly ordered by date (no override row at all),
  // so the initial swap has to pin down the whole visible list's current
  // positions, not just the two being swapped.
  async function moveEvent(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= visible.length) return;
    const withOrder = visible.map((ev, i) => ev.sortOrder ?? i);
    const a = visible[index];
    const b = visible[target];
    await Promise.all([
      saveOverride(a, { sortOrder: withOrder[target] }),
      saveOverride(b, { sortOrder: withOrder[index] }),
    ]);
  }

  async function subscribe(e: React.FormEvent) {
    e.preventDefault();
    setSubSaving(true);
    setSubError(null);
    try {
      await fetchJson("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: subEmail.trim(), name: subName.trim() || undefined }),
      });
      setSubDone(true);
      setSubEmail("");
      setSubName("");
      setSubscriberCount((c) => c + 1);
    } catch (e) {
      setSubError(e instanceof Error ? e.message : "Could not sign up. Try again.");
    } finally {
      setSubSaving(false);
    }
  }

  return (
    <>
      <Masthead />
      <main>
        <div className="status-strip">
          Week Ahead — pulled automatically from the calendar for the current Monday–Sunday, resets every Monday.
          Hide, reorder, or write a shorter blurb for any event below without changing the calendar entry itself.
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="pane" style={{ marginBottom: 20 }}>
          <div className="pane-head">
            <h2>Get this in your inbox</h2>
            <span style={{ fontSize: ".8rem", color: "var(--ink-soft)", fontStyle: "italic" }}>
              {subscriberCount} signed up
            </span>
          </div>
          <div style={{ padding: "16px 18px" }}>
            <p style={{ margin: "0 0 12px", fontSize: ".88rem", color: "var(--ink-soft)" }}>
              The newsletter itself isn't sending yet — this just saves your spot on the list for when it does.
            </p>
            {subDone ? (
              <p style={{ margin: 0, fontWeight: 700, color: "var(--pesto)" }}>Thanks — you're on the list ✓</p>
            ) : (
              <form onSubmit={subscribe} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                {subError && <div className="error-banner" style={{ width: "100%" }}>{subError}</div>}
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: ".85rem", color: "var(--ink-soft)" }}>
                  Email
                  <input
                    type="email"
                    required
                    value={subEmail}
                    onChange={(e) => setSubEmail(e.target.value)}
                    style={{
                      fontFamily: "inherit",
                      fontSize: ".95rem",
                      padding: "8px 10px",
                      border: "1px solid var(--line)",
                      borderRadius: 3,
                      background: "var(--paper)",
                      color: "var(--ink)",
                      minWidth: 220,
                    }}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: ".85rem", color: "var(--ink-soft)" }}>
                  Name (optional)
                  <input
                    type="text"
                    value={subName}
                    onChange={(e) => setSubName(e.target.value)}
                    style={{
                      fontFamily: "inherit",
                      fontSize: ".95rem",
                      padding: "8px 10px",
                      border: "1px solid var(--line)",
                      borderRadius: 3,
                      background: "var(--paper)",
                      color: "var(--ink)",
                      minWidth: 180,
                    }}
                  />
                </label>
                <button className="action btn-primary" type="submit" disabled={subSaving}>
                  {subSaving ? "Signing up…" : "Subscribe"}
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="pane">
          <div className="pane-head">
            <h2>{weekStart && weekEnd ? formatWeekLabel(weekStart, weekEnd) : "This week"}</h2>
            <span style={{ fontSize: ".8rem", color: "var(--ink-soft)", fontStyle: "italic" }}>
              {loading ? "Loading…" : `${visible.length} event${visible.length === 1 ? "" : "s"}`}
            </span>
          </div>
          <ul className="event-list" style={{ maxHeight: "none" }}>
            {!loading && visible.length === 0 && (
              <p className="empty-hint" style={{ padding: "0 4px" }}>
                Nothing on the calendar for this week yet.
              </p>
            )}
            {visible.map((ev, i) => {
              const t = resolveTag(ev.tag);
              const isSaving = savingIds.has(ev.id);
              return (
                <li className="event-card" key={ev.id} style={{ cursor: "default" }}>
                  <div className="row1">
                    <span className="title">{ev.title}</span>
                    <span className="date">{formatShort(ev.startDate)}</span>
                  </div>
                  <span className={tagPillClass(t)}>{t.label}</span>
                  <div className="desc">{ev.note || ev.description || "No description yet."}</div>
                  {ev.link && (
                    <p style={{ margin: "4px 0 0" }}>
                      <a href={ev.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: ".82rem" }}>
                        View source →
                      </a>
                    </p>
                  )}
                  <div className="week-ahead-actions">
                    <button className="icon-btn" disabled={i === 0 || isSaving} onClick={() => moveEvent(i, -1)}>
                      ↑
                    </button>
                    <button className="icon-btn" disabled={i === visible.length - 1 || isSaving} onClick={() => moveEvent(i, 1)}>
                      ↓
                    </button>
                    <button className="icon-btn" onClick={() => startEdit(ev)}>
                      Edit blurb
                    </button>
                    <button className="icon-btn" onClick={() => saveOverride(ev, { hidden: true })} disabled={isSaving}>
                      Hide from this week
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {hidden.length > 0 && (
          <div className="pane" style={{ marginTop: 20 }}>
            <div className="pane-head">
              <h2>Hidden from this week</h2>
              <span style={{ fontSize: ".8rem", color: "var(--ink-soft)", fontStyle: "italic" }}>
                {hidden.length} event{hidden.length === 1 ? "" : "s"}
              </span>
            </div>
            <ul className="event-list" style={{ maxHeight: "none" }}>
              {hidden.map((ev) => {
                const t = resolveTag(ev.tag);
                return (
                  <li className="event-card" key={ev.id} style={{ cursor: "default", opacity: 0.6 }}>
                    <div className="row1">
                      <span className="title">{ev.title}</span>
                      <span className="date">{formatShort(ev.startDate)}</span>
                    </div>
                    <span className={tagPillClass(t)}>{t.label}</span>
                    <div className="week-ahead-actions">
                      <button className="icon-btn" onClick={() => saveOverride(ev, { hidden: false })}>
                        Show in this week
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </main>

      {editingId && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setEditingId(null)}>
          <div className="modal">
            <h3>Newsletter blurb</h3>
            <p style={{ fontSize: ".85rem", color: "var(--ink-soft)", marginTop: 0 }}>
              Overrides just this event's description for Week Ahead — the calendar entry itself is untouched.
            </p>
            <form className="event-form" onSubmit={submitEdit}>
              <label>
                Blurb
                <textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} rows={4} />
              </label>
              <div className="modal-actions">
                <button type="button" className="action btn-ghost" onClick={() => setEditingId(null)}>
                  Cancel
                </button>
                <button type="submit" className="action btn-primary">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
