import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, friendlyDbError, sql } from "@/lib/db";
import { isEventTag, isValidTime, rowToEvent } from "@/lib/events";

export const runtime = "nodejs";

export async function GET() {
  try {
    await ensureSchema();
    const { rows } = await sql`SELECT * FROM events ORDER BY start_date ASC, created_at ASC;`;
    return NextResponse.json({ events: rows.map(rowToEvent) });
  } catch (err) {
    console.error("GET /api/events failed", err);
    return NextResponse.json({ error: friendlyDbError(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const body = await req.json();
    const { title, tag, startDate, endDate, time, description, link, source } = body ?? {};

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
    const cleanTime = isValidTime(time) ? time : null;
    const cleanLink = typeof link === "string" && link.trim() ? link.trim() : null;
    const cleanSource = source === "ai-scan" ? "ai-scan" : "manual";
    const id = randomUUID();

    const { rows } = await sql`
      INSERT INTO events (id, title, tag, start_date, end_date, event_time, description, link, source)
      VALUES (${id}, ${title.trim()}, ${tag}, ${startDate}, ${cleanEndDate}, ${cleanTime}, ${
      typeof description === "string" ? description.trim() : ""
    }, ${cleanLink}, ${cleanSource})
      RETURNING *;
    `;
    return NextResponse.json({ event: rowToEvent(rows[0]) }, { status: 201 });
  } catch (err) {
    console.error("POST /api/events failed", err);
    return NextResponse.json({ error: friendlyDbError(err) }, { status: 500 });
  }
}
