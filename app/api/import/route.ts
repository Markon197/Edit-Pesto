import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, friendlyDbError, logActivity, sql } from "@/lib/db";
import { isEventTag, isLikelyDuplicate, isValidTime } from "@/lib/events";
import { SUBMIT_IMPORT_TOOL, buildImportPrompt } from "@/lib/calendarPrompts";

export const runtime = "nodejs";
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Generous enough for a long AI-generated events list or a copied
// conference schedule, bounded so one paste can't run away with cost/time.
const MAX_TEXT_LENGTH = 12000;

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Server is missing ANTHROPIC_API_KEY. Add it in the Vercel project settings." },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const rawText = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_TEXT_LENGTH) : "";
  if (!rawText) {
    return NextResponse.json({ error: "Paste some text to import first." }, { status: 400 });
  }

  // DB step is isolated so a database problem reports as a database
  // problem, not a generic "couldn't process that" that hides the cause.
  let existingTitles: string[];
  try {
    await ensureSchema();
    const { rows } = await sql`SELECT title FROM events;`;
    existingTitles = rows.map((r: any) => r.title);
  } catch (err) {
    console.error("GET existing events failed (import)", err);
    return NextResponse.json({ error: friendlyDbError(err) }, { status: 500 });
  }

  try {
    const todayISO = new Date().toISOString().slice(0, 10);

    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      system:
        "You are a careful assistant that extracts and formats calendar events from text the user provides. Only use what's in the text — never invent dates or details.",
      tools: [SUBMIT_IMPORT_TOOL],
      // Forced, not "auto" — this is a straightforward extraction task with
      // no search step and nothing to reasonably ask about, so always call
      // the tool rather than risk a stray text reply with no structured
      // result to show.
      tool_choice: { type: "tool", name: "submit_import" },
      messages: [{ role: "user", content: buildImportPrompt(todayISO, rawText, existingTitles) }],
    });

    const submitBlock = message.content.find(
      (b: any) => b.type === "tool_use" && b.name === "submit_import"
    ) as any;

    if (!submitBlock) {
      return NextResponse.json({ error: "Couldn't make sense of that text. Try again." }, { status: 502 });
    }

    const found = Array.isArray(submitBlock.input?.events) ? submitBlock.input.events : [];
    const candidates = found
      .filter((e: any) => typeof e?.title === "string" && typeof e?.startDate === "string")
      .filter((e: any) => !isLikelyDuplicate(e.title, existingTitles))
      .map((e: any) => ({
        title: e.title,
        tag: isEventTag(e.tag) ? e.tag : "event",
        startDate: e.startDate,
        endDate: typeof e.endDate === "string" ? e.endDate : null,
        time: isValidTime(e.time) ? e.time : null,
        location: null,
        description: typeof e.description === "string" ? e.description : "",
        link: typeof e.link === "string" ? e.link : null,
      }));

    await logActivity("import_events", `found ${candidates.length}`);
    return NextResponse.json({ candidates });
  } catch (err) {
    console.error("POST /api/import failed", err);
    return NextResponse.json(
      { error: "Could not process that text. Try again in a moment." },
      { status: 500 }
    );
  }
}
