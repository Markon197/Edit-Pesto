import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/db";
import { normalizeMetricValue } from "@/lib/earnings";
import { SUBMIT_EARNINGS_REPORT_TOOL, buildEarningsReportPrompt } from "@/lib/earningsPrompts";

export const runtime = "nodejs";
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// This is used rarely, so the limit is generous — mainly a backstop
// against a truly runaway paste, matching the Calendar Import's own cap.
const MAX_TEXT_LENGTH = 60000;

// Returns a draft only — nothing is saved here. The review step (the
// earnings page's form) lets the user check/edit the extraction before
// POST /api/earnings actually writes it.
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
    return NextResponse.json({ error: "Paste some text to extract from first." }, { status: 400 });
  }

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      system:
        "You are a careful assistant that extracts structured earnings data from text the user provides. Only use what's in the text — never invent a number, date, or comparison.",
      tools: [SUBMIT_EARNINGS_REPORT_TOOL],
      // Forced — a straightforward extraction task with no search step,
      // always call the tool rather than risk a stray text reply.
      tool_choice: { type: "tool", name: "submit_earnings_report" },
      messages: [{ role: "user", content: buildEarningsReportPrompt(rawText) }],
    });

    const submitBlock = message.content.find(
      (b: any) => b.type === "tool_use" && b.name === "submit_earnings_report"
    ) as any;

    if (!submitBlock) {
      return NextResponse.json({ error: "Couldn't make sense of that text. Try again." }, { status: 502 });
    }

    const input = submitBlock.input ?? {};
    const draft = {
      company: typeof input.company === "string" ? input.company : "",
      period: typeof input.period === "string" ? input.period : "",
      priorPeriod: typeof input.priorPeriod === "string" ? input.priorPeriod : "",
      reportDate: typeof input.reportDate === "string" ? input.reportDate : "",
      ticker: typeof input.ticker === "string" ? input.ticker : "",
      // normalizeMetricValue is a backstop, not the primary fix — the
      // prompt already asks for symbols-not-codes and minus-not-parens,
      // this just catches the cases where the model doesn't fully comply.
      metrics: Array.isArray(input.metrics)
        ? input.metrics
            .filter((m: any) => m && typeof m.label === "string" && typeof m.current === "string")
            .map((m: any) => ({
              label: m.label,
              current: normalizeMetricValue(m.current),
              priorYear: typeof m.priorYear === "string" ? normalizeMetricValue(m.priorYear) : "",
              change: typeof m.change === "string" ? normalizeMetricValue(m.change) : "",
            }))
        : [],
      takeaways: Array.isArray(input.takeaways) ? input.takeaways.filter((t: any) => typeof t === "string") : [],
      officialLink: typeof input.officialLink === "string" ? input.officialLink : "",
      earningsCallLink: typeof input.earningsCallLink === "string" ? input.earningsCallLink : "",
      sourceText: rawText,
    };

    await logActivity("extract_earnings_report", draft.company ? `${draft.company} — ${draft.period}` : undefined);
    return NextResponse.json({ draft });
  } catch (err) {
    console.error("POST /api/earnings/extract failed", err);
    return NextResponse.json(
      { error: "Could not process that text. Try again in a moment." },
      { status: 500 }
    );
  }
}
