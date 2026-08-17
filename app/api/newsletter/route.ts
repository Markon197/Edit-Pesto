import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, friendlyDbError, logActivity, sql } from "@/lib/db";

export const runtime = "nodejs";

function isValidEmail(v: unknown): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const body = await req.json().catch(() => ({}));
    const { email, name } = body ?? {};

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    const cleanEmail = (email as string).trim().toLowerCase();
    const cleanName = typeof name === "string" && name.trim() ? name.trim().slice(0, 100) : null;

    // ON CONFLICT DO NOTHING, and always report success either way — never
    // let the response reveal whether an email was already on the list.
    await sql`
      INSERT INTO newsletter_subscribers (id, email, name)
      VALUES (${randomUUID()}, ${cleanEmail}, ${cleanName})
      ON CONFLICT (email) DO NOTHING;
    `;
    await logActivity("newsletter_signup");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/newsletter failed", err);
    return NextResponse.json({ error: friendlyDbError(err) }, { status: 500 });
  }
}
