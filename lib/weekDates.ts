// Monday-start week math, shared between the Calendar tab's week view and
// Week Ahead. Deliberately all-UTC throughout: parsing "T00:00:00" as local
// time and then reading it back via toISOString() (UTC) silently shifts
// the date by a day for anyone in a positive UTC offset — the UK included,
// whenever BST is in effect — and since mondayOf() re-snaps to Monday on
// every call, that error compounds. Staying in UTC start-to-finish avoids
// it entirely (this was a real, shipped bug — see Version 13's changelog
// entry — not a hypothetical one).
export function addDays(iso: string, delta: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function mondayOf(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const offset = (d.getUTCDay() + 6) % 7; // Monday-start
  return addDays(iso, -offset);
}

export function weekDatesFrom(mondayIso: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayIso, i));
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
