import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { isEventTag, type CalendarEvent } from "@/lib/events";

export const runtime = "nodejs";

function rowToEvent(row: any): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    tag: row.tag,
    startDate: toDateString(row.start_date),
    endDate: row.end_date ? toDateString(row.end_date) : null,
    description: row.description ?? "",
    link: row.link ?? null,
    source: row.source === "ai-scan" ? "ai-scan" : "manual",
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

// Postgres DATE columns come back as JS Date objects (midnight UTC) via
// @vercel/postgres — format as YYYY-MM-DD without a timezone round-trip
// shifting the day.
function toDateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export async function GET() {
  try {
    await ensureSchema();
    const { rows } = await sql`SELECT * FROM events ORDER BY start_date ASC, created_at ASC;`;
    return NextResponse.json({ events: rows.map(rowToEvent) });
  } catch (err) {
    console.error("GET /api/events failed", err);
    return NextResponse.json(
      { error: "Could not load the calendar. Check the database is connected (see README)." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const body = await req.json();
    const { title, tag, startDate, endDate, description, link, source } = body ?? {};

    if (typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "An event needs a title." }, { status: 400 });
    }
    if (!isEventTag(tag)) {
      return NextResponse.json({ error: "Pick a valid tag." }, { status: 400 });
    }
    if (typeof startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return NextResponse.json({ error: "An event needs a valid start date." }, { status: 400 });
    }
    const cleanEndDate = typeof endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate : null;
    const cleanLink = typeof link === "string" && link.trim() ? link.trim() : null;
    const cleanSource = source === "ai-scan" ? "ai-scan" : "manual";
    const id = randomUUID();

    const { rows } = await sql`
      INSERT INTO events (id, title, tag, start_date, end_date, description, link, source)
      VALUES (${id}, ${title.trim()}, ${tag}, ${startDate}, ${cleanEndDate}, ${
      typeof description === "string" ? description.trim() : ""
    }, ${cleanLink}, ${cleanSource})
      RETURNING *;
    `;
    return NextResponse.json({ event: rowToEvent(rows[0]) }, { status: 201 });
  } catch (err) {
    console.error("POST /api/events failed", err);
    return NextResponse.json({ error: "Could not save the event. Try again." }, { status: 500 });
  }
}
