import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

function makeToken(secret: string): string {
  const payload = `ewa-session:${Date.now()}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(`${payload}|${sig}`).toString("base64url");
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { email, password } = body as { email?: string; password?: string };

  const expectedEmail = process.env.AUTH_EMAIL;
  const expectedPassword = process.env.AUTH_PASSWORD;
  const secret = process.env.AUTH_SECRET || "fallback-secret";

  if (
    !expectedEmail ||
    !expectedPassword ||
    email?.toLowerCase().trim() !== expectedEmail.toLowerCase().trim() ||
    password !== expectedPassword
  ) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = makeToken(secret);
  const res = NextResponse.json({ ok: true });

  res.cookies.set("ewa_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });

  return res;
}
