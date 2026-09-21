import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/db";
import {
  MAX_ARTICLE_CHARS,
  QUICK_MODEL,
  SUBMIT_FACT_CHECK_TOOL,
  buildFactCheckPrompt,
} from "@/lib/articleAiPrompts";

export const runtime = "nodejs";
export const maxDuration = 30;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CATEGORIES = ["name", "title_or_role", "company", "fact", "inconsistency"];

// Quick and cheap on purpose: Haiku, no web search, one call, forced tool
// output, small max_tokens. It's a second pair of eyes on names/titles/
// consistency, not a research desk — the UI says so.
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
      max_tokens: 1200,
      system:
        "You are a careful, conservative fact-checker for an insurance trade publication. You would rather miss a doubtful point than raise a false alarm.",
      tools: [SUBMIT_FACT_CHECK_TOOL],
      tool_choice: { type: "tool", name: "submit_fact_check" },
      messages: [{ role: "user", content: buildFactCheckPrompt(text, new Date().toISOString().slice(0, 10)) }],
    });

    const block = message.content.find((b: any) => b.type === "tool_use") as any;
    if (!block) {
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
        confidence: i.confidence === "high" ? "high" : "medium",
      }));

    await logActivity("fact_check", `${issues.length} flagged`);
    return NextResponse.json({
      summary: typeof input.summary === "string" ? input.summary : "",
      issues,
    });
  } catch (err) {
    console.error("POST /api/factcheck failed", err);
    await logActivity("fact_check_error");
    return NextResponse.json({ error: "The accuracy check failed. Try again in a moment." }, { status: 500 });
  }
}
