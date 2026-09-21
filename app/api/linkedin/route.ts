import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/db";
import {
  MAX_ARTICLE_CHARS,
  QUICK_MODEL,
  SUBMIT_LINKEDIN_POST_TOOL,
  buildLinkedInPrompt,
} from "@/lib/articleAiPrompts";

export const runtime = "nodejs";
export const maxDuration = 30;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
    return NextResponse.json({ error: "That article is too long for a quick post." }, { status: 400 });
  }

  try {
    const message = await anthropic.messages.create({
      model: QUICK_MODEL,
      max_tokens: 500,
      system: "You write concise, factual LinkedIn posts for an insurance trade publication.",
      tools: [SUBMIT_LINKEDIN_POST_TOOL],
      tool_choice: { type: "tool", name: "submit_linkedin_post" },
      messages: [{ role: "user", content: buildLinkedInPrompt(text) }],
    });

    const block = message.content.find((b: any) => b.type === "tool_use") as any;
    const post = typeof block?.input?.post === "string" ? block.input.post.trim() : "";
    if (!post) {
      return NextResponse.json({ error: "Couldn't write a post from that. Try again." }, { status: 502 });
    }

    // Only keep tags that really appear in the post, so a chip never points
    // at something the text doesn't say.
    const seen = new Set<string>();
    const mentions = (Array.isArray(block.input.mentions) ? block.input.mentions : [])
      .filter((m: any) => m && typeof m.name === "string" && m.name.trim())
      .map((m: any) => ({
        name: m.name.trim().replace(/^@/, ""),
        kind: m.kind === "company" ? "company" : "person",
      }))
      .filter((m: { name: string }) => {
        const key = m.name.toLowerCase();
        if (seen.has(key) || !post.toLowerCase().includes(`@${key}`)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 4);

    await logActivity("linkedin_post");
    return NextResponse.json({ post, mentions });
  } catch (err) {
    console.error("POST /api/linkedin failed", err);
    await logActivity("linkedin_post_error");
    return NextResponse.json({ error: "Couldn't generate a post. Try again in a moment." }, { status: 500 });
  }
}
