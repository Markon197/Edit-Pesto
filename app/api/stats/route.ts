import { NextResponse } from "next/server";
import { ensureSchema, friendlyDbError, sql } from "@/lib/db";

export const runtime = "nodejs";

const DAILY_WINDOW_DAYS = 30;

// Every logged action is one "use" regardless of type — this just counts
// activity_log rows per calendar day, zero-filled so a quiet day shows as
// an empty bar rather than a gap. UTC throughout (both the SQL grouping
// and the JS date walk below) so the two line up — see app/calendar/page.tsx's
// addDays()/mondayOf() comment for why a local/UTC mismatch is a real bug,
// not a nitpick.
function buildDailySeries(rows: { day: unknown; count: number }[], days: number) {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const iso = r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10);
    counts.set(iso, r.count);
  }
  const series: { date: string; count: number }[] = [];
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(cursor);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    series.push({ date: iso, count: counts.get(iso) ?? 0 });
  }
  return series;
}

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
    // Interpolating a number *inside* an INTERVAL string literal doesn't
    // work with a parameterized query — the driver binds ${...} as a query
    // parameter ($1), and a parameter placeholder inside a quoted string
    // literal is just literal text to Postgres, not substitution. Days *
    // INTERVAL '1 day' keeps the parameter outside any string, so it binds
    // correctly.
    // (created_at AT TIME ZONE 'UTC')::date, not DATE(created_at) — the
    // plain cast groups by the session's configured timezone, which isn't
    // guaranteed to be UTC. Explicit UTC here matches the UTC zero-fill
    // walk in buildDailySeries() below, so the two can't drift apart.
    const { rows: dailyRows } = await sql`
      SELECT (created_at AT TIME ZONE 'UTC')::date AS day, COUNT(*)::int AS count
      FROM activity_log
      WHERE created_at >= NOW() - (${DAILY_WINDOW_DAYS} * INTERVAL '1 day')
      GROUP BY day
      ORDER BY day ASC;
    `;
    const daily = buildDailySeries(dailyRows as any[], DAILY_WINDOW_DAYS);
    return NextResponse.json({ counts, recent, daily });
  } catch (err) {
    console.error("GET /api/stats failed", err);
    return NextResponse.json({ error: friendlyDbError(err) }, { status: 500 });
  }
}
