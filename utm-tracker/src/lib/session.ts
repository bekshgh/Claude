// Signed session tokens. Uses Web Crypto so the same code runs in the
// Edge middleware and in Node route handlers.

export const SESSION_COOKIE = "ewa_session";
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days

const PREFIX = "ewa-session";
const encoder = new TextEncoder();

function getSecret(): string | null {
  const secret = process.env.AUTH_SECRET;
  return secret && secret.length >= 16 ? secret : null;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return toBase64Url(new Uint8Array(sig));
}

/** Compares two strings without leaking where they differ. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Returns null when AUTH_SECRET is missing or too short. */
export async function createSessionToken(): Promise<string | null> {
  const secret = getSecret();
  if (!secret) return null;
  const payload = `${PREFIX}:${Date.now()}`;
  const sig = await hmac(secret, payload);
  return toBase64Url(encoder.encode(`${payload}|${sig}`));
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  const secret = getSecret();
  if (!secret || !token) return false;

  let decoded: string;
  try {
    decoded = fromBase64Url(token);
  } catch {
    return false;
  }

  const sep = decoded.lastIndexOf("|");
  if (sep < 0) return false;
  const payload = decoded.slice(0, sep);
  const sig = decoded.slice(sep + 1);

  const [prefix, issuedAtRaw] = payload.split(":");
  const issuedAt = Number(issuedAtRaw);
  if (prefix !== PREFIX || !Number.isFinite(issuedAt)) return false;

  const age = Date.now() - issuedAt;
  if (age < 0 || age > SESSION_MAX_AGE_SEC * 1000) return false;

  return safeEqual(sig, await hmac(secret, payload));
}
