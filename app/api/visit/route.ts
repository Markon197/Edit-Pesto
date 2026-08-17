import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/db";

export const runtime = "nodejs";

// Pinged once per page load from components/Masthead.tsx (rendered fresh
// on every page — Edit, Calendar, and Stats itself all mount their own
// copy, so this fires once per navigation, tab switch included). It's a
// page-view count, not a deduplicated-session count — there's no session
// tracking in this app, just the one shared site password.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const path = typeof body?.path === "string" ? body.path.slice(0, 100) : undefined;
  await logActivity("site_visit", path);
  return NextResponse.json({ ok: true });
}
