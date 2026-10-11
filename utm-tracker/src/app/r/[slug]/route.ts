import { NextRequest, NextResponse } from "next/server";
import { UAParser } from "ua-parser-js";
import { prisma } from "@/lib/db";
import { generateClickId, hashIp, buildDestinationUrl } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /r/{slug}
 * 1. Look up the tracking link.
 * 2. Record a server-side ClickEvent (so ad blockers / JS-off still count).
 * 3. Generate a clickId and forward it + UTM to the destination (Tilda).
 * 4. 302 redirect the visitor instantly.
 */
export async function GET(req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const slug = params.slug;

  const link = await prisma.trackingLink.findUnique({ where: { slug } });

  // Unknown or disabled link → send to homepage rather than a dead end.
  if (!link || !link.isActive || link.isArchived) {
    return NextResponse.redirect(new URL("/", req.url), 302);
  }

  // --- gather request metadata ---
  const ua = req.headers.get("user-agent") || "";
  const referrer = req.headers.get("referer") || null;
  const ipRaw =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  const ipHash = hashIp(ipRaw);
  // Vercel's geo headers (Next 15 dropped req.geo; it read the same headers).
  const country = req.headers.get("x-vercel-ip-country") || null;
  const city = req.headers.get("x-vercel-ip-city") || null;

  const parsed = new UAParser(ua).getResult();
  const device = parsed.device.type || "desktop";
  const browser = parsed.browser.name || null;
  const os = parsed.os.name || null;

  // Capture any extra query params present on the short link itself.
  const rawParams: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => (rawParams[k] = v));

  const clickId = generateClickId();

  // Unique = first time we see this ipHash for this link (best-effort).
  let isUnique = true;
  if (ipHash) {
    const prior = await prisma.clickEvent.findFirst({
      where: { trackingLinkId: link.id, ipHash },
      select: { id: true },
    });
    isUnique = !prior;
  }

  // Record the click. Never block the redirect on a DB hiccup.
  try {
    await prisma.clickEvent.create({
      data: {
        trackingLinkId: link.id,
        clickId,
        userAgent: ua || null,
        ipHash,
        referrer,
        country,
        city,
        device,
        browser,
        os,
        isUnique,
        rawParams: Object.keys(rawParams).length ? rawParams : undefined,
      },
    });
  } catch (err) {
    console.error("click_record_failed", err);
  }

  const destination = buildDestinationUrl(
    link.destinationUrl,
    {
      utmSource: link.utmSource,
      utmMedium: link.utmMedium,
      utmCampaign: link.utmCampaign,
      utmContent: link.utmContent,
      utmTerm: link.utmTerm,
    },
    (link.customParams as Record<string, string> | null) ?? null,
    clickId
  );

  return NextResponse.redirect(destination, 302);
}
