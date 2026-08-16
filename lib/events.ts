// Shared types for the Calendar tab. Kept in one place so the API routes,
// the DB layer, and the UI all agree on what a tag is.

export const EVENT_TAGS = ["event", "earnings", "editorial", "holiday"] as const;
export type EventTag = (typeof EVENT_TAGS)[number];

export const TAG_LABELS: Record<EventTag, string> = {
  event: "Industry event",
  earnings: "Earnings",
  editorial: "Editorial",
  holiday: "Bank Holiday",
};

export function isEventTag(value: unknown): value is EventTag {
  return typeof value === "string" && (EVENT_TAGS as readonly string[]).includes(value);
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
