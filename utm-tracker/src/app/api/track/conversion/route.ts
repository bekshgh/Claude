import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { recordLead } from "@/lib/leads";
import { type NormalisedLead } from "@/lib/attribution";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public conversion endpoint for the on-page snippet.
 *
 * The snippet calls this (via navigator.sendBeacon / fetch / image pixel) when
 * a Tilda form is submitted successfully, so a lead is counted even when no
 * server-side webhook is configured.
 *
 * Abuse guard: this endpoint is unauthenticated, so it accepts ONLY a click_id
 * that matches a real recorded click. Combined with the "ck:<clickId>" dedupe
 * key, the worst a forged request can do is create at most one lead per
 * already-existing click_id. Requests without a valid click_id are no-ops.
 */

// 1x1 transparent GIF for the <img> pixel fallback.
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

async function readInput(req: NextRequest): Promise<Record<string, unknown>> {
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

async function handle(req: NextRequest) {
  const body = await readInput(req);
  const wantsPixel = req.method === "GET";

  const ok = (extra: Record<string, unknown> = {}) =>
    wantsPixel
      ? new NextResponse(PIXEL, {
          status: 200,
          headers: { ...CORS, "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0" },
        })
      : NextResponse.json({ ok: true, ...extra }, { headers: CORS });

  const clickId = str(body.click_id) || str(body.clickId);
  if (!clickId) return ok({ ignored: "no_click_id" });

  // Spam guard: the click_id must match a real recorded click.
  const click = await prisma.clickEvent.findUnique({
    where: { clickId },
    select: { id: true },
  });
  if (!click) return ok({ ignored: "unknown_click_id" });

  const lead: NormalisedLead = {
    name: str(body.name),
    phone: str(body.phone),
    email: str(body.email),
    formName: str(body.formname) || str(body.formName),
    pageUrl: str(body.pageUrl) || str(body.page_url) || str(body.url),
    clickId,
    utmSource: str(body.utm_source),
    utmMedium: str(body.utm_medium),
    utmCampaign: str(body.utm_campaign),
    utmContent: str(body.utm_content),
    utmTerm: str(body.utm_term),
    submittedAt: new Date(),
  };

  const result = await recordLead(lead, {
    provider: "snippet",
    rawPayload: { ...body, _source: "snippet" } as Record<string, string>,
  });

  return ok({ leadId: result.leadId, deduped: result.deduped, attribution: result.attribution });
}

export const POST = handle;
export const GET = handle;
