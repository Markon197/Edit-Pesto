// Generates a minimal, spec-compliant .ics (RFC 5545) file for a single
// all-day event, client-side — no server round-trip needed. Compatible
// with Outlook, Google Calendar, and Apple Calendar imports.

type IcsEventInput = {
  id: string;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string | null; // YYYY-MM-DD, inclusive (our convention)
  description: string;
  link: string | null;
};

function escapeIcsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function toIcsDate(iso: string): string {
  return iso.replace(/-/g, "");
}

// iCal all-day events use an *exclusive* DTEND — the day after the last
// day the event actually covers.
function dayAfter(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function nowStamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

export function eventToIcs(ev: IcsEventInput): string {
  const dtEndExclusive = dayAfter(ev.endDate || ev.startDate);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PestoBot//InsuranceERM Calendar//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${ev.id}@pestobot.insuranceerm`,
    `DTSTAMP:${nowStamp()}`,
    `DTSTART;VALUE=DATE:${toIcsDate(ev.startDate)}`,
    `DTEND;VALUE=DATE:${toIcsDate(dtEndExclusive)}`,
    `SUMMARY:${escapeIcsText(ev.title)}`,
  ];
  if (ev.description) lines.push(`DESCRIPTION:${escapeIcsText(ev.description)}`);
  if (ev.link) lines.push(`URL:${ev.link}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadIcs(ev: IcsEventInput): void {
  const ics = eventToIcs(ev);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${ev.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60)}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
