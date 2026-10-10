import { NextRequest, NextResponse } from "next/server";

/**
 * Helpers shared by the public endpoints the on-page snippet calls
 * (/api/track/conversion, /api/track/submit). The snippet may use
 * navigator.sendBeacon, fetch or an <img> pixel, so we accept all of them.
 */

// 1x1 transparent GIF for the <img> pixel fallback.
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

export async function readInput(req: NextRequest): Promise<Record<string, unknown>> {
  if (req.method === "GET") {
    const o: Record<string, unknown> = {};
    req.nextUrl.searchParams.forEach((v, k) => (o[k] = v));
    return o;
  }
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return (await req.json().catch(() => ({}))) as Record<string, unknown>;
  }
  if (ct.includes("form")) {
    const fd = await req.formData().catch(() => null);
    const o: Record<string, unknown> = {};
    if (fd) fd.forEach((v, k) => (o[k] = typeof v === "string" ? v : v.name));
    return o;
  }
  // sendBeacon sends a text/plain Blob whose body is the JSON string.
  const txt = await req.text().catch(() => "");
  try {
    return txt ? (JSON.parse(txt) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** 200 response: a GIF for pixel (GET) requests, JSON otherwise. */
export function beaconOk(req: NextRequest, extra: Record<string, unknown> = {}) {
  return req.method === "GET"
    ? new NextResponse(PIXEL, {
        status: 200,
        headers: { ...CORS, "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0" },
      })
    : NextResponse.json({ ok: true, ...extra }, { headers: CORS });
}
