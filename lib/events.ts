// Shared types for the Calendar tab. Kept in one place so the API routes,
// the DB layer, and the UI all agree on what a tag is.

export const EVENT_TAGS = ["event", "earnings", "editorial"] as const;
export type EventTag = (typeof EVENT_TAGS)[number];

export const TAG_LABELS: Record<EventTag, string> = {
  event: "Industry event",
  earnings: "Earnings",
  editorial: "Editorial",
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
  description: string;
  link: string | null;
  source: "manual" | "ai-scan";
  createdAt: string;
};

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
