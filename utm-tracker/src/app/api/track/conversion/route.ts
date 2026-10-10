import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { recordLead } from "@/lib/leads";
import { type NormalisedLead } from "@/lib/attribution";
import { CORS, beaconOk, readInput, str } from "@/lib/beacon";

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

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

async function handle(req: NextRequest) {
  const body = await readInput(req);
  const ok = (extra?: Record<string, unknown>) => beaconOk(req, extra);

  const clickId = str(body.click_id) || str(body.clickId);
  if (!clickId) return ok({ ignored: "no_click_id" });

  // Spam guard: the click_id must match a real recorded click.
  const click = await prisma.clickEvent.findUnique({
    where: { clickId },
    select: {
      id: true,
      trackingLink: { select: { utmSource: true, utmMedium: true, utmCampaign: true, utmContent: true, utmTerm: true } },
    },
  });
  if (!click) return ok({ ignored: "unknown_click_id" });

  const lead: NormalisedLead = {
    name: str(body.name),
    phone: str(body.phone),
    email: str(body.email),
    formName: str(body.formname) || str(body.formName),
    pageUrl: str(body.pageUrl) || str(body.page_url) || str(body.url),
    clickId,
    // UTM from the page, else from the link the visitor came through.
    utmSource: str(body.utm_source) || str(click.trackingLink.utmSource),
    utmMedium: str(body.utm_medium) || str(click.trackingLink.utmMedium),
    utmCampaign: str(body.utm_campaign) || str(click.trackingLink.utmCampaign),
    utmContent: str(body.utm_content) || str(click.trackingLink.utmContent),
    utmTerm: str(body.utm_term) || str(click.trackingLink.utmTerm),
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
