// Shared types for the Calendar tab. Kept in one place so the API routes,
// the DB layer, and the UI all agree on what a tag is.
//
// Tags themselves used to be a hardcoded list here (EVENT_TAGS/TAG_LABELS).
// They're now team-editable and live in the `tags` table — see lib/tags.ts
// for the TagDef shape, the color palette, and the builtin seed list. An
// event's `tag` is just whatever id was current when it was saved, so this
// stays a plain string rather than a fixed union — a tag can be renamed or
// deleted later without invalidating already-saved events (the UI falls
// back to a plain grey label for a tag id that no longer exists).
export type EventTag = string;

// Format check only, not membership in a fixed list — any non-empty, sane-
// length string is accepted, since the valid set now lives in the database
// and changes at runtime.
export function isEventTag(value: unknown): value is EventTag {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 40;
}

export type CalendarEvent = {
  id: string;
  title: string;
  tag: EventTag;
  startDate: string; // YYYY-MM-DD
  endDate: string | null; // YYYY-MM-DD, for multi-day events
  time: string | null; // HH:MM, 24-hour, optional
  description: string;
  link: string | null;
  source: "manual" | "ai-scan";
  createdAt: string;
};

export function isValidTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

// Postgres DATE columns come back as JS Date objects (midnight UTC) via
// @vercel/postgres — format as YYYY-MM-DD without a timezone round-trip
// shifting the day.
export function toDateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export function rowToEvent(row: any): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    tag: row.tag,
    startDate: toDateString(row.start_date),
    endDate: row.end_date ? toDateString(row.end_date) : null,
    time: row.event_time ?? null,
    description: row.description ?? "",
    link: row.link ?? null,
    source: row.source === "ai-scan" ? "ai-scan" : "manual",
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

// A simple, deliberately non-fuzzy dedup check: normalizes whitespace/case
// and treats a candidate as a duplicate if its title contains, or is
// contained by, an existing event's title. Good enough for "don't show
// Monte Carlo Rendez-Vous again" without pulling in a similarity library.
export function isLikelyDuplicate(candidateTitle: string, existingTitles: string[]): boolean {
  const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");
  const c = norm(candidateTitle);
  if (!c) return false;
  return existingTitles.some((t) => {
    const e = norm(t);
    if (!e) return false;
    return c === e || c.includes(e) || e.includes(c);
  });
}
