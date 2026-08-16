import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, friendlyDbError, logActivity, sql } from "@/lib/db";
import { isLikelyDuplicate } from "@/lib/events";
import { WEB_SEARCH_TOOL, SUBMIT_EVENTS_TOOL, buildEventsScanPrompt } from "@/lib/calendarPrompts";

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
    const { rows } = await sql`SELECT title FROM events WHERE tag = 'event';`;
    existingTitles = rows.map((r: any) => r.title);
  } catch (err) {
    console.error("GET existing events failed (scan/events)", err);
    return NextResponse.json({ error: friendlyDbError(err) }, { status: 500 });
  }

  try {
    const todayISO = new Date().toISOString().slice(0, 10);

    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      system: "You are a careful research assistant. Only report facts you found real, current evidence for via search — never invent a date.",
      // web_search is a server tool with a different shape than a custom
      // function tool (no input_schema), so the SDK's Tool type doesn't
      // cover it — type the array loosely rather than per-element.
      tools: [WEB_SEARCH_TOOL, SUBMIT_EVENTS_TOOL] as unknown as Anthropic.Tool[],
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: buildEventsScanPrompt(todayISO, existingTitles, focus) }],
    });
    // NOTE: previously passed { signal: req.signal } here so "Stop scan"
    // would cancel the upstream call too. Removed — it's the most likely
    // cause of scans failing outright after that change shipped. Client
    // side stop (aborting the fetch) still works; it just no longer
    // guarantees cutting the server-side call short. Revisit separately.

    const submitBlock = message.content.find(
      (b: any) => b.type === "tool_use" && b.name === "submit_events"
    ) as any;

    if (!submitBlock) {
      return NextResponse.json(
        { error: "The scan didn't return a usable result. Try again." },
        { status: 502 }
      );
    }

    const found = Array.isArray(submitBlock.input?.events) ? submitBlock.input.events : [];
    const candidates = found
      .filter((e: any) => typeof e?.title === "string" && typeof e?.startDate === "string")
      .filter((e: any) => !isLikelyDuplicate(e.title, existingTitles))
      .map((e: any) => ({
        title: e.title,
        startDate: e.startDate,
        endDate: typeof e.endDate === "string" ? e.endDate : null,
        location: typeof e.location === "string" ? e.location : null,
        description: typeof e.description === "string" ? e.description : "",
        link: typeof e.link === "string" ? e.link : null,
      }));

    await logActivity("scan_events", `found ${candidates.length}`);
    return NextResponse.json({ candidates });
  } catch (err) {
    console.error("POST /api/scan/events failed", err);
    return NextResponse.json(
      {
        error:
          "The web search step failed. Try again in a moment — if it keeps happening, tell Claude the exact error from the Vercel function logs.",
      },
      { status: 500 }
    );
  }
}
