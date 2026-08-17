import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, friendlyDbError, logActivity, sql } from "@/lib/db";
import { isTagColor, rowToTag, slugify } from "@/lib/tags";

export const runtime = "nodejs";

export async function GET() {
  try {
    await ensureSchema();
    const { rows } = await sql`SELECT * FROM tags ORDER BY sort_order ASC, label ASC;`;
    return NextResponse.json({ tags: rows.map(rowToTag) });
  } catch (err) {
    console.error("GET /api/tags failed", err);
    return NextResponse.json({ error: friendlyDbError(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const body = await req.json().catch(() => ({}));
    const { label, color, highlight } = body ?? {};

    if (typeof label !== "string" || !label.trim()) {
      return NextResponse.json({ error: "A tag needs a name." }, { status: 400 });
    }
    if (!isTagColor(color)) {
      return NextResponse.json({ error: "Pick a valid color." }, { status: 400 });
    }
    const cleanLabel = label.trim().slice(0, 60);

    const { rows: existing } = await sql`SELECT id FROM tags;`;
    const existingIds = new Set(existing.map((r: any) => r.id as string));
    let id = slugify(cleanLabel);
    if (existingIds.has(id)) {
      let n = 2;
      while (existingIds.has(`${id}-${n}`)) n++;
      id = `${id}-${n}`;
    }

    const { rows: maxRows } = await sql`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM tags;`;
    const nextOrder = maxRows[0]?.next ?? 0;

    const { rows } = await sql`
      INSERT INTO tags (id, label, color, highlight, sort_order)
      VALUES (${id}, ${cleanLabel}, ${color}, ${!!highlight}, ${nextOrder})
      RETURNING *;
    `;
    await logActivity("add_tag", cleanLabel);
    return NextResponse.json({ tag: rowToTag(rows[0]) }, { status: 201 });
  } catch (err) {
    console.error("POST /api/tags failed", err);
    return NextResponse.json({ error: friendlyDbError(err) }, { status: 500 });
  }
}
