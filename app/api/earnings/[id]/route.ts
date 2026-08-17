import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, friendlyDbError, logActivity, sql } from "@/lib/db";
import { rowToEarningsReport, rowToPressCoverage } from "@/lib/earnings";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureSchema();
    const { id } = params;
    const { rows } = await sql`SELECT * FROM earnings_reports WHERE id = ${id};`;
    if (rows.length === 0) {
      return NextResponse.json({ error: "That report no longer exists." }, { status: 404 });
    }
    const { rows: pressRows } = await sql`
      SELECT * FROM press_coverage WHERE earnings_report_id = ${id} ORDER BY added_at DESC;
    `;
    return NextResponse.json({
      report: rowToEarningsReport(rows[0]),
      pressCoverage: pressRows.map(rowToPressCoverage),
    });
  } catch (err) {
    console.error("GET /api/earnings/[id] failed", err);
    return NextResponse.json({ error: friendlyDbError(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureSchema();
    const { id } = params;
    const { rows } = await sql`DELETE FROM earnings_reports WHERE id = ${id} RETURNING company, period;`;
    const detail = rows[0] ? `${rows[0].company} — ${rows[0].period}` : undefined;
    await logActivity("delete_earnings_report", detail);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/earnings/[id] failed", err);
    return NextResponse.json({ error: friendlyDbError(err) }, { status: 500 });
  }
}
