import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, friendlyDbError, sql } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureSchema();
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: "Missing event id." }, { status: 400 });
    }
    await sql`DELETE FROM events WHERE id = ${id};`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/events/[id] failed", err);
    return NextResponse.json({ error: friendlyDbError(err) }, { status: 500 });
  }
}
