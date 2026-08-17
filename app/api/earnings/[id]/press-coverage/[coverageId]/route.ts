import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, friendlyDbError, logActivity, sql } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest, { params }: { params: { id: string; coverageId: string } }) {
  try {
    await ensureSchema();
    const { coverageId } = params;
    if (!coverageId) {
      return NextResponse.json({ error: "Missing item id." }, { status: 400 });
    }
    const { rows } = await sql`
      DELETE FROM press_coverage WHERE id = ${coverageId} RETURNING outlet, headline;
    `;
    const detail = rows[0] ? `${rows[0].outlet} — ${rows[0].headline}` : undefined;
    await logActivity("delete_press_coverage", detail);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/earnings/[id]/press-coverage/[coverageId] failed", err);
    return NextResponse.json({ error: friendlyDbError(err) }, { status: 500 });
  }
}
