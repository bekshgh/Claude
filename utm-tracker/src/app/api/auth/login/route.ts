import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE_SEC, createSessionToken, safeEqual } from "@/lib/session";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { email, password } = body as { email?: string; password?: string };

  const expectedEmail = process.env.AUTH_EMAIL;
  const expectedPassword = process.env.AUTH_PASSWORD;

  if (
    !expectedEmail ||
    !expectedPassword ||
    typeof email !== "string" ||
    typeof password !== "string" ||
    email.toLowerCase().trim() !== expectedEmail.toLowerCase().trim() ||
    !safeEqual(password, expectedPassword)
  ) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await createSessionToken();
  if (!token) {
    return NextResponse.json(
      { error: "Server misconfigured: AUTH_SECRET must be set (16+ characters)" },
      { status: 500 },
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SEC,
    path: "/",
  });

  return res;
}
