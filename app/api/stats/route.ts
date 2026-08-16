import { NextResponse } from "next/server";
import { ensureSchema, friendlyDbError, sql } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    await ensureSchema();
    const { rows: counts } = await sql`
      SELECT action, COUNT(*)::int AS count
      FROM activity_log
      GROUP BY action
      ORDER BY count DESC;
    `;
    const { rows: recent } = await sql`
      SELECT action, detail, created_at
      FROM activity_log
      ORDER BY created_at DESC
      LIMIT 40;
    `;
    return NextResponse.json({ counts, recent });
  } catch (err) {
    console.error("GET /api/stats failed", err);
    return NextResponse.json({ error: friendlyDbError(err) }, { status: 500 });
  }
}
