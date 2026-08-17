import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, friendlyDbError, logActivity, sql } from "@/lib/db";
import { rowToPressCoverage } from "@/lib/earnings";

export const runtime = "nodejs";

// Manual add — one item at a time, whether typed by hand or accepted from
// an /extract candidate. Never touched by the AI extraction itself; that
// route only ever returns candidates, this is the only place anything
// actually gets saved.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureSchema();
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: "Missing report id." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const { outlet, headline, description, link } = body ?? {};

    if (typeof outlet !== "string" || !outlet.trim()) {
      return NextResponse.json({ error: "An outlet name is required." }, { status: 400 });
    }
    if (typeof headline !== "string" || !headline.trim()) {
      return NextResponse.json({ error: "A headline is required." }, { status: 400 });
    }
    if (typeof link !== "string" || !link.trim()) {
      return NextResponse.json({ error: "A link is required." }, { status: 400 });
    }

    const coverageId = randomUUID();
    const { rows } = await sql`
      INSERT INTO press_coverage (id, earnings_report_id, outlet, headline, description, link)
      VALUES (
        ${coverageId}, ${id}, ${outlet.trim()}, ${headline.trim()},
        ${typeof description === "string" ? description.trim() : ""}, ${link.trim()}
      )
      RETURNING *;
    `;
    await logActivity("add_press_coverage", `${outlet.trim()} — ${headline.trim()}`);
    return NextResponse.json({ item: rowToPressCoverage(rows[0]) }, { status: 201 });
  } catch (err) {
    console.error("POST /api/earnings/[id]/press-coverage failed", err);
    return NextResponse.json({ error: friendlyDbError(err) }, { status: 500 });
  }
}
