import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { ensureSchema, sql } from "@/lib/db";
import { isLikelyDuplicate } from "@/lib/events";
import { WEB_SEARCH_TOOL, SUBMIT_EVENTS_TOOL, buildEventsScanPrompt } from "@/lib/calendarPrompts";

export const runtime = "nodejs";
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Server is missing ANTHROPIC_API_KEY. Add it in the Vercel project settings." },
      { status: 500 }
    );
  }

  try {
    await ensureSchema();
    const { rows } = await sql`SELECT title FROM events WHERE tag = 'event';`;
    const existingTitles: string[] = rows.map((r: any) => r.title);

    const todayISO = new Date().toISOString().slice(0, 10);

    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      system: "You are a careful research assistant. Only report facts you found real, current evidence for via search — never invent a date.",
      tools: [WEB_SEARCH_TOOL as Anthropic.Tool, SUBMIT_EVENTS_TOOL as Anthropic.Tool],
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: buildEventsScanPrompt(todayISO, existingTitles) }],
    });

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

    return NextResponse.json({ candidates });
  } catch (err) {
    console.error("POST /api/scan/events failed", err);
    return NextResponse.json({ error: "The scan failed. Try again in a moment." }, { status: 500 });
  }
}
