import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, friendlyDbError, logActivity, sql } from "@/lib/db";
import { rowToEarningsReport } from "@/lib/earnings";
import { SUBMIT_PRESS_COVERAGE_TOOL, buildPressCoveragePrompt } from "@/lib/pressCoveragePrompts";

export const runtime = "nodejs";
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MAX_TEXT_LENGTH = 60000;

// Returns candidates only — nothing is saved here. The report page shows
// them the same way a Calendar scan shows its results: reviewed and added
// (or left out) one by one via POST /api/earnings/[id]/press-coverage.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Server is missing ANTHROPIC_API_KEY. Add it in the Vercel project settings." },
      { status: 500 }
    );
  }

  try {
    await ensureSchema();
    const { id } = params;
    const { rows } = await sql`SELECT * FROM earnings_reports WHERE id = ${id};`;
    if (rows.length === 0) {
      return NextResponse.json({ error: "That report no longer exists." }, { status: 404 });
    }
    const report = rowToEarningsReport(rows[0]);

    const body = await req.json().catch(() => ({}));
    const rawText = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_TEXT_LENGTH) : "";
    if (!rawText) {
      return NextResponse.json({ error: "Paste some text or links to extract from first." }, { status: 400 });
    }

    const { rows: existingRows } = await sql`
      SELECT link FROM press_coverage WHERE earnings_report_id = ${id};
    `;
    const existingLinks = new Set(existingRows.map((r: any) => r.link as string));

    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      system:
        "You are a careful assistant that extracts press-coverage citations from text the user provides. Only use what's in the text — never invent a headline, outlet, or description.",
      tools: [SUBMIT_PRESS_COVERAGE_TOOL],
      tool_choice: { type: "tool", name: "submit_press_coverage" },
      messages: [{ role: "user", content: buildPressCoveragePrompt(report.company, report.period, rawText) }],
    });

    const submitBlock = message.content.find(
      (b: any) => b.type === "tool_use" && b.name === "submit_press_coverage"
    ) as any;
    if (!submitBlock) {
      return NextResponse.json({ error: "Couldn't make sense of that text. Try again." }, { status: 502 });
    }

    const found = Array.isArray(submitBlock.input?.items) ? submitBlock.input.items : [];
    const candidates = found
      .filter((it: any) => it && typeof it.outlet === "string" && typeof it.headline === "string" && typeof it.link === "string")
      .filter((it: any) => !existingLinks.has(it.link))
      .map((it: any) => ({
        outlet: it.outlet,
        headline: it.headline,
        description: typeof it.description === "string" ? it.description : "",
        link: it.link,
      }));

    await logActivity("extract_press_coverage", `found ${candidates.length}`);
    return NextResponse.json({ candidates });
  } catch (err) {
    console.error("POST /api/earnings/[id]/press-coverage/extract failed", err);
    return NextResponse.json(
      { error: "Could not process that text. Try again in a moment." },
      { status: 500 }
    );
  }
}
