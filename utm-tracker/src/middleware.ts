import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// Only the incoming Tilda webhook is public; /api/webhooks/test is an admin action.
const PUBLIC = ["/login", "/api/auth/login", "/api/auth/logout", "/api/webhooks/tilda-lead"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // allow public paths and redirect routes
  if (
    PUBLIC.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/r/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  if (await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  const res = NextResponse.redirect(loginUrl);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
