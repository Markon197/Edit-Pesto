import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, friendlyDbError, logActivity, sql } from "@/lib/db";
import { isEventTag, isValidTime, rowToEvent } from "@/lib/events";

export const runtime = "nodejs";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureSchema();
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: "Missing event id." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const { title, tag, startDate, endDate, time, description, link } = body ?? {};

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

    const { rows } = await sql`
      UPDATE events
      SET title = ${title.trim()},
          tag = ${tag},
          start_date = ${startDate},
          end_date = ${cleanEndDate},
          event_time = ${cleanTime},
          description = ${typeof description === "string" ? description.trim() : ""},
          link = ${cleanLink}
      WHERE id = ${id}
      RETURNING *;
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: "That event no longer exists." }, { status: 404 });
    }
    await logActivity("edit_event", title.trim());
    return NextResponse.json({ event: rowToEvent(rows[0]) });
  } catch (err) {
    console.error("PUT /api/events/[id] failed", err);
    return NextResponse.json({ error: friendlyDbError(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureSchema();
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: "Missing event id." }, { status: 400 });
    }
    const { rows } = await sql`DELETE FROM events WHERE id = ${id} RETURNING title;`;
    await logActivity("delete_event", rows[0]?.title ?? undefined);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/events/[id] failed", err);
    return NextResponse.json({ error: friendlyDbError(err) }, { status: 500 });
  }
}
