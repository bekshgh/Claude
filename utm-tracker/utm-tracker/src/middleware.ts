import { NextRequest, NextResponse } from "next/server";

const PUBLIC = ["/login", "/api/auth/login", "/api/auth/logout", "/api/webhooks"];

export function middleware(req: NextRequest) {
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

  const session = req.cookies.get("ewa_session")?.value;
  if (!session) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
