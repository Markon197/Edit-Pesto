import Anthropic from "@anthropic-ai/sdk";
import sanitizeHtml from "sanitize-html";
import { NextRequest, NextResponse } from "next/server";
import { buildSystemPrompt, SUBMIT_REVIEW_TOOL } from "@/lib/styleGuide";

export const runtime = "nodejs";
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ALLOWED_TAGS = [
  "p",
  "br",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "a",
  "ul",
  "ol",
  "li",
  "del",
  "ins",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
];

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Server is missing ANTHROPIC_API_KEY. Add it in the Vercel project settings." },
      { status: 500 }
    );
  }

  let html: unknown;
  try {
    const body = await req.json();
    html = body?.html;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  if (typeof html !== "string" || !html.trim()) {
    return NextResponse.json({ error: "Paste an article before checking." }, { status: 400 });
  }
  if (html.length > 60000) {
    return NextResponse.json(
      { error: "That article is too long for a single check. Split it and try again." },
      { status: 400 }
    );
  }

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 8000,
      system: buildSystemPrompt(),
      tools: [SUBMIT_REVIEW_TOOL as Anthropic.Tool],
      tool_choice: { type: "tool", name: "submit_review" },
      messages: [{ role: "user", content: html }],
    });

    const toolUse = message.content.find(
      (block: any) => block.type === "tool_use"
    ) as any;

    if (!toolUse) {
      return NextResponse.json(
        { error: "The check didn't return a usable result. Try again." },
        { status: 502 }
      );
    }

    const parsed = toolUse.input as {
      annotated_html?: string;
      headlines?: string[];
      companies?: string[];
      people?: string[];
    };

    const safeHtml = sanitizeHtml(parsed.annotated_html ?? "", {
      allowedTags: ALLOWED_TAGS,
      allowedAttributes: { a: ["href", "target", "rel"] },
      transformTags: {
        a: sanitizeHtml.simpleTransform(
          "a",
          { target: "_blank", rel: "noopener noreferrer" },
          true
        ),
      },
    });

    return NextResponse.json({
      annotatedHtml: safeHtml,
      headlines: Array.isArray(parsed.headlines) ? parsed.headlines.slice(0, 5) : [],
      companies: Array.isArray(parsed.companies) ? parsed.companies : [],
      people: Array.isArray(parsed.people) ? parsed.people : [],
    });
  } catch (err) {
    console.error("edit-pesto check failed", err);
    return NextResponse.json(
      { error: "Something went wrong while checking the article. Try again in a moment." },
      { status: 500 }
    );
  }
}
