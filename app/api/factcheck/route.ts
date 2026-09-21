import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/db";
import { webSearchTool } from "@/lib/calendarPrompts";
import {
  FACT_CHECK_MAX_SEARCHES,
  MAX_ARTICLE_CHARS,
  QUICK_MODEL,
  SUBMIT_FACT_CHECK_TOOL,
  buildFactCheckPrompt,
} from "@/lib/articleAiPrompts";

export const runtime = "nodejs";
// Vercel's ceiling without Fluid Compute. A capped, Haiku-only search run
// should finish well inside it — the earlier calendar scans that hit 504s
// were Sonnet doing 4-6 sequential searches with big prompts.
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CATEGORIES = ["name", "title_or_role", "company", "fact", "inconsistency"];

// Cost is bounded three ways: Haiku, a hard search cap (max_uses), and a
// small max_tokens. Names and titles need the web to be checked properly —
// the cap is what keeps that from becoming open-ended research.
export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Server is missing ANTHROPIC_API_KEY. Add it in the Vercel project settings." },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Check an article first." }, { status: 400 });
  }
  if (text.length > MAX_ARTICLE_CHARS) {
    return NextResponse.json({ error: "That article is too long for a quick accuracy check." }, { status: 400 });
  }

  try {
    const message = await anthropic.messages.create({
      model: QUICK_MODEL,
      max_tokens: 2000,
      system:
        "You are a careful, conservative fact-checker for an insurance trade publication. You would rather miss a doubtful point than raise a false alarm.",
      // web_search is a server tool with no input_schema, so the SDK's Tool
      // type doesn't cover it — same cast the calendar scans use. Can't force
      // tool_choice to the submit tool here (the model has to be free to
      // search first), so "auto" and look for the submit block below.
      tools: [webSearchTool(FACT_CHECK_MAX_SEARCHES), SUBMIT_FACT_CHECK_TOOL] as unknown as Anthropic.Tool[],
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: buildFactCheckPrompt(text, new Date().toISOString().slice(0, 10)) }],
    });

    const block = message.content.find(
      (b: any) => b.type === "tool_use" && b.name === "submit_fact_check"
    ) as any;
    if (!block) {
      await logActivity("fact_check_error", "no result block");
      return NextResponse.json({ error: "The check didn't return a usable result. Try again." }, { status: 502 });
    }

    const input = block.input ?? {};
    const issues = (Array.isArray(input.issues) ? input.issues : [])
      .filter((i: any) => i && typeof i.excerpt === "string" && typeof i.problem === "string")
      .slice(0, 8)
      .map((i: any) => ({
        excerpt: i.excerpt,
        category: CATEGORIES.includes(i.category) ? i.category : "fact",
        problem: i.problem,
        suggestion: typeof i.suggestion === "string" ? i.suggestion : "",
        // Only ever hand the browser an http(s) link to put in an <a href>.
        source: typeof i.source === "string" && /^https?:\/\//i.test(i.source.trim()) ? i.source.trim() : "",
        confidence: i.confidence === "high" ? "high" : "medium",
      }));
    const confirmed = (Array.isArray(input.confirmed) ? input.confirmed : [])
      .filter((c: any) => typeof c === "string" && c.trim())
      .slice(0, 6);

    await logActivity("fact_check", `${issues.length} flagged, ${confirmed.length} confirmed`);
    return NextResponse.json({
      summary: typeof input.summary === "string" ? input.summary : "",
      issues,
      confirmed,
    });
  } catch (err) {
    console.error("POST /api/factcheck failed", err);
    await logActivity("fact_check_error");
    return NextResponse.json({ error: "The accuracy check failed. Try again in a moment." }, { status: 500 });
  }
}
