import { prisma } from "@/lib/db";
import { AttributionStatus } from "@prisma/client";

export interface NormalisedLead {
  name?: string;
  phone?: string;
  email?: string;
  formName?: string;
  pageUrl?: string;
  clickId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  submittedAt: Date;
}

export interface AttributionResult {
  status: AttributionStatus;
  clickEventId: string | null;
  trackingLinkId: string | null;
}

const ESTIMATED_WINDOW_HOURS = 72;

/**
 * Resolve which click / link a lead belongs to.
 *
 * 1. EXACT      — there is a click_id and it matches a stored ClickEvent.
 * 2. ESTIMATED  — no click_id, but utm_campaign/source + a recent click
 *                 on a matching link within the time window.
 * 3. UNKNOWN    — nothing matched.
 */
export async function resolveAttribution(lead: NormalisedLead): Promise<AttributionResult> {
  // 1. Exact attribution via click_id
  if (lead.clickId) {
    const click = await prisma.clickEvent.findUnique({
      where: { clickId: lead.clickId },
      select: { id: true, trackingLinkId: true },
    });
    if (click) {
      return {
        status: AttributionStatus.exact,
        clickEventId: click.id,
        trackingLinkId: click.trackingLinkId,
      };
    }
  }

  // 2. Estimated attribution via UTM + recent click
  const utmFilter: Record<string, string> = {};
  if (lead.utmCampaign) utmFilter.utmCampaign = lead.utmCampaign;
  if (lead.utmSource) utmFilter.utmSource = lead.utmSource;
  if (lead.utmContent) utmFilter.utmContent = lead.utmContent;

  if (Object.keys(utmFilter).length > 0) {
    const link = await prisma.trackingLink.findFirst({
      where: utmFilter,
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });

    if (link) {
      const since = new Date(lead.submittedAt.getTime() - ESTIMATED_WINDOW_HOURS * 3_600_000);
      const recentClick = await prisma.clickEvent.findFirst({
        where: { trackingLinkId: link.id, timestamp: { gte: since, lte: lead.submittedAt } },
        orderBy: { timestamp: "desc" },
        select: { id: true },
      });
      return {
        status: AttributionStatus.estimated,
        clickEventId: recentClick?.id ?? null,
        trackingLinkId: link.id,
      };
    }
  }

  // 3. Nothing matched
  return { status: AttributionStatus.unknown, clickEventId: null, trackingLinkId: null };
}
