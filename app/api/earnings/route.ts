import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, friendlyDbError, logActivity, sql } from "@/lib/db";
import { normalizeMetricValue, rowToEarningsReport } from "@/lib/earnings";

export const runtime = "nodejs";

export async function GET() {
  try {
    await ensureSchema();
    const { rows } = await sql`
      SELECT * FROM earnings_reports
      ORDER BY report_date DESC NULLS LAST, created_at DESC;
    `;
    return NextResponse.json({ reports: rows.map(rowToEarningsReport) });
  } catch (err) {
    console.error("GET /api/earnings failed", err);
    return NextResponse.json({ error: friendlyDbError(err) }, { status: 500 });
  }
}

// Saves a report after the user has reviewed (and possibly edited) the
// draft that POST /api/earnings/extract returned — this endpoint never
// talks to Claude itself, it's a plain save.
export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const body = await req.json().catch(() => ({}));
    const { company, period, priorPeriod, reportDate, ticker, sourceText, metrics, takeaways, officialLink, earningsCallLink } =
      body ?? {};

    if (typeof company !== "string" || !company.trim()) {
      return NextResponse.json({ error: "A report needs a company name." }, { status: 400 });
    }
    if (typeof period !== "string" || !period.trim()) {
      return NextResponse.json({ error: "A report needs a reporting period, e.g. 'H1 2026'." }, { status: 400 });
    }

    const cleanMetrics = Array.isArray(metrics)
      ? metrics
          .filter((m: any) => m && typeof m.label === "string" && m.label.trim() && typeof m.current === "string" && m.current.trim())
          .map((m: any) => ({
            label: m.label.trim(),
            current: normalizeMetricValue(m.current),
            priorYear: typeof m.priorYear === "string" && m.priorYear.trim() ? normalizeMetricValue(m.priorYear) : undefined,
            change: typeof m.change === "string" && m.change.trim() ? normalizeMetricValue(m.change) : undefined,
          }))
      : [];
    const cleanTakeaways = Array.isArray(takeaways)
      ? takeaways.filter((t: any) => typeof t === "string" && t.trim()).map((t: string) => t.trim())
      : [];
    const cleanReportDate =
      typeof reportDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(reportDate) ? reportDate : null;
    const cleanLink = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

    const id = randomUUID();
    const { rows } = await sql`
      INSERT INTO earnings_reports
        (id, company, period, prior_period, report_date, ticker, source_text, metrics, takeaways, official_link, earnings_call_link)
      VALUES (
        ${id}, ${company.trim()}, ${period.trim()}, ${cleanLink(priorPeriod)}, ${cleanReportDate}, ${cleanLink(ticker)},
        ${cleanLink(sourceText)}, ${JSON.stringify(cleanMetrics)}::jsonb, ${JSON.stringify(cleanTakeaways)}::jsonb,
        ${cleanLink(officialLink)}, ${cleanLink(earningsCallLink)}
      )
      RETURNING *;
    `;
    await logActivity("add_earnings_report", `${company.trim()} — ${period.trim()}`);
    return NextResponse.json({ report: rowToEarningsReport(rows[0]) }, { status: 201 });
  } catch (err) {
    console.error("POST /api/earnings failed", err);
    return NextResponse.json({ error: friendlyDbError(err) }, { status: 500 });
  }
}
