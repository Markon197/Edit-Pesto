import { NextResponse } from "next/server";
import { ensureSchema, friendlyDbError, logActivity, sql } from "@/lib/db";
import { isLikelyDuplicate } from "@/lib/events";

export const runtime = "nodejs";
export const maxDuration = 30;

// UK government's own published bank holiday data — deterministic, no AI
// call needed (unlike the other two scans). england-and-wales division,
// since that's the standard reference for UK business calendars.
const GOV_UK_BANK_HOLIDAYS_URL = "https://www.gov.uk/bank-holidays.json";

export async function POST() {
  let existingTitles: string[];
  try {
    await ensureSchema();
    const { rows } = await sql`SELECT title FROM events WHERE tag = 'holiday';`;
    existingTitles = rows.map((r: any) => r.title);
  } catch (err) {
    console.error("GET existing events failed (holidays)", err);
    return NextResponse.json({ error: friendlyDbError(err) }, { status: 500 });
  }

  try {
    const res = await fetch(GOV_UK_BANK_HOLIDAYS_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`gov.uk responded ${res.status}`);
    const data = await res.json();
    const ukEvents: Array<{ title: string; date: string }> = data?.["england-and-wales"]?.events ?? [];

    const todayISO = new Date().toISOString().slice(0, 10);
    const windowEndISO = `${new Date().getFullYear() + 1}-12-31`;

    const candidates = ukEvents
      .filter((e) => e.date >= todayISO && e.date <= windowEndISO)
      .filter((e) => !isLikelyDuplicate(e.title, existingTitles))
      .map((e) => ({
        title: e.title,
        startDate: e.date,
        endDate: null,
        location: null,
        description: "UK bank holiday (England & Wales).",
        link: GOV_UK_BANK_HOLIDAYS_URL,
      }));

    await logActivity("scan_holidays", `found ${candidates.length}`);
    return NextResponse.json({ candidates, windowEndISO });
  } catch (err) {
    console.error("POST /api/holidays failed", err);
    return NextResponse.json(
      { error: "Could not fetch UK bank holidays right now. Try again in a moment." },
      { status: 500 }
    );
  }
}
