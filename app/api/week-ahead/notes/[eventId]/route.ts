import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, friendlyDbError, logActivity, sql } from "@/lib/db";

export const runtime = "nodejs";

// Upserts the Week Ahead override for one event — a custom blurb, hidden
// flag, and/or manual sort position. No row at all (the common case) just
// means "show it as-is, in date order."
export async function PUT(req: NextRequest, { params }: { params: { eventId: string } }) {
  try {
    await ensureSchema();
    const { eventId } = params;
    if (!eventId) {
      return NextResponse.json({ error: "Missing event id." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const { note, hidden, sortOrder } = body ?? {};
    const cleanNote = typeof note === "string" && note.trim() ? note.trim() : null;
    const cleanHidden = !!hidden;
    const cleanSortOrder = typeof sortOrder === "number" && Number.isFinite(sortOrder) ? sortOrder : 0;

    await sql`
      INSERT INTO week_ahead_notes (event_id, note, hidden, sort_order, updated_at)
      VALUES (${eventId}, ${cleanNote}, ${cleanHidden}, ${cleanSortOrder}, now())
      ON CONFLICT (event_id) DO UPDATE
      SET note = EXCLUDED.note, hidden = EXCLUDED.hidden, sort_order = EXCLUDED.sort_order, updated_at = now();
    `;
    await logActivity("week_ahead_edit", eventId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PUT /api/week-ahead/notes/[eventId] failed", err);
    return NextResponse.json({ error: friendlyDbError(err) }, { status: 500 });
  }
}
