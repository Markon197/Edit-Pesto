import { NextResponse } from "next/server";
import { ensureSchema, friendlyDbError, sql } from "@/lib/db";
import { rowToEvent } from "@/lib/events";
import { mondayOf, todayISO, weekDatesFrom } from "@/lib/weekDates";

export const runtime = "nodejs";

export async function GET() {
  try {
    await ensureSchema();
    const weekStart = mondayOf(todayISO());
    const weekDates = weekDatesFrom(weekStart);
    const weekEnd = weekDates[6];

    // Same "does this event touch this window" overlap test the calendar
    // itself uses — a multi-day event only needs to start before the week
    // ends and end on/after the week starts to count.
    const { rows } = await sql`
      SELECT e.*, w.note AS override_note, w.hidden AS override_hidden, w.sort_order AS override_sort_order
      FROM events e
      LEFT JOIN week_ahead_notes w ON w.event_id = e.id
      WHERE e.start_date <= ${weekEnd} AND COALESCE(e.end_date, e.start_date) >= ${weekStart}
      ORDER BY COALESCE(w.sort_order, 999999) ASC, e.start_date ASC;
    `;
    const events = rows.map((row: any) => ({
      ...rowToEvent(row),
      note: row.override_note ?? null,
      hidden: !!row.override_hidden,
      sortOrder: row.override_sort_order ?? null,
    }));

    const { rows: countRows } = await sql`SELECT COUNT(*)::int AS count FROM newsletter_subscribers;`;
    const subscriberCount = countRows[0]?.count ?? 0;

    return NextResponse.json({ weekStart, weekEnd, events, subscriberCount });
  } catch (err) {
    console.error("GET /api/week-ahead failed", err);
    return NextResponse.json({ error: friendlyDbError(err) }, { status: 500 });
  }
}
