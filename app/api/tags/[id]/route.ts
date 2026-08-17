import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, friendlyDbError, logActivity, sql } from "@/lib/db";
import { isTagColor, rowToTag } from "@/lib/tags";

export const runtime = "nodejs";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureSchema();
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: "Missing tag id." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const { label, color, highlight } = body ?? {};

    if (typeof label !== "string" || !label.trim()) {
      return NextResponse.json({ error: "A tag needs a name." }, { status: 400 });
    }
    if (!isTagColor(color)) {
      return NextResponse.json({ error: "Pick a valid color." }, { status: 400 });
    }

    const { rows } = await sql`
      UPDATE tags
      SET label = ${label.trim().slice(0, 60)},
          color = ${color},
          highlight = ${!!highlight}
      WHERE id = ${id}
      RETURNING *;
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: "That tag no longer exists." }, { status: 404 });
    }
    await logActivity("edit_tag", rowToTag(rows[0]).label);
    return NextResponse.json({ tag: rowToTag(rows[0]) });
  } catch (err) {
    console.error("PUT /api/tags/[id] failed", err);
    return NextResponse.json({ error: friendlyDbError(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureSchema();
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: "Missing tag id." }, { status: 400 });
    }
    // Deliberately no cascade/reassignment: events already using this tag
    // keep their (now-orphaned) tag id and the UI falls back to a plain
    // grey label for it, rather than blocking deletion or silently
    // retagging events to something the user didn't choose.
    const { rows } = await sql`DELETE FROM tags WHERE id = ${id} RETURNING label;`;
    await logActivity("delete_tag", rows[0]?.label ?? undefined);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/tags/[id] failed", err);
    return NextResponse.json({ error: friendlyDbError(err) }, { status: 500 });
  }
}
