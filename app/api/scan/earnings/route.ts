import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, friendlyDbError, logActivity, sql } from "@/lib/db";
import { isLikelyDuplicate, isValidTime } from "@/lib/events";
import { webSearchTool, SUBMIT_EARNINGS_TOOL, buildEarningsScanPrompt } from "@/lib/calendarPrompts";

export const runtime = "nodejs";
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Server is missing ANTHROPIC_API_KEY. Add it in the Vercel project settings." },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const focus = typeof body?.focus === "string" ? body.focus.trim().slice(0, 300) : "";

  // DB step is isolated so a database problem reports as a database
  // problem, not a generic "the scan failed" that hides the real cause.
  let existingTitles: string[];
  try {
    await ensureSchema();
    const { rows } = await sql`SELECT title FROM events WHERE tag = 'earnings';`;
    existingTitles = rows.map((r: any) => r.title);
  } catch (err) {
    console.error("GET existing events failed (scan/earnings)", err);
    return NextResponse.json({ error: friendlyDbError(err) }, { status: 500 });
  }

  try {
    const today = new Date();
    const todayISO = today.toISOString().slice(0, 10);
    const windowEnd = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
    const windowEndISO = windowEnd.toISOString().slice(0, 10);

    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      system: "You are a careful research assistant. Only report facts you found real, current evidence for via search — never invent a date, and never include anything outside the requested date window.",
      // web_search is a server tool with a different shape than a custom
      // function tool (no input_schema), so the SDK's Tool type doesn't
      // cover it — type the array loosely rather than per-element.
      tools: [webSearchTool(3), SUBMIT_EARNINGS_TOOL] as unknown as Anthropic.Tool[],
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: buildEarningsScanPrompt(todayISO, windowEndISO, existingTitles, focus) }],
    });
    // NOTE: previously passed { signal: req.signal } here — removed, see
    // app/api/scan/events/route.ts for why.

    const submitBlock = message.content.find(
      (b: any) => b.type === "tool_use" && b.name === "submit_earnings"
    ) as any;

    if (!submitBlock) {
      return NextResponse.json(
        { error: "The scan didn't return a usable result. Try again." },
        { status: 502 }
      );
    }

    const found = Array.isArray(submitBlock.input?.earnings) ? submitBlock.input.earnings : [];
    const candidates = found
      .filter((e: any) => typeof e?.company === "string" && typeof e?.date === "string")
      .filter((e: any) => e.date >= todayISO && e.date <= windowEndISO)
      .filter((e: any) => !isLikelyDuplicate(e.company, existingTitles))
      .map((e: any) => ({
        title: e.company,
        startDate: e.date,
        endDate: null,
        time: isValidTime(e.time) ? e.time : null,
        location: null,
        description: typeof e.description === "string" ? e.description : "",
        link: typeof e.link === "string" ? e.link : null,
      }));

    await logActivity("scan_earnings", `found ${candidates.length}`);
    return NextResponse.json({ candidates, windowEndISO });
  } catch (err) {
    console.error("POST /api/scan/earnings failed", err);
    return NextResponse.json(
      {
        error:
          "The web search step failed. Try again in a moment — if it keeps happening, tell Claude the exact error from the Vercel function logs.",
      },
      { status: 500 }
    );
  }
}
