import { NextRequest, NextResponse } from "next/server";

// Simple shared-password gate for the whole site (internal tool, small team).
// Set SITE_PASSWORD in .env.local for local dev and in the Vercel project's
// Environment Variables for production.
function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Edit Pesto"' },
  });
}

export function middleware(req: NextRequest) {
  const expected = process.env.SITE_PASSWORD;
  if (!expected) return NextResponse.next(); // no password configured yet

  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Basic ")) return unauthorized();

  try {
    const decoded = atob(auth.slice(6));
    const password = decoded.slice(decoded.indexOf(":") + 1);
    if (password === expected) return NextResponse.next();
  } catch {
    // fall through to unauthorized
  }
  return unauthorized();
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
