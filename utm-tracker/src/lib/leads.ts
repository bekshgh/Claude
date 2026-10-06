import { Prisma, AttributionStatus, WebhookStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { buildDedupeKey } from "@/lib/utils";
import { resolveAttribution, type NormalisedLead } from "@/lib/attribution";

export interface RecordLeadResult {
  leadId: string;
  deduped: boolean;
  attribution: AttributionStatus | null;
  hasClickId: boolean;
}

/**
 * Create a lead from a normalised payload, or return the existing one when a
 * lead with the same dedupe key already exists.
 *
 * Shared by the Tilda webhook (server-side) and the /api/track/conversion
 * endpoint (client-side snippet). Because buildDedupeKey collapses to
 * "ck:<clickId>" whenever a click_id is present, the same submission arriving
 * through both channels is recorded only once.
 */
export async function recordLead(
  lead: NormalisedLead,
  opts: { provider: string; rawPayload: Prisma.InputJsonValue },
): Promise<RecordLeadResult> {
  const dedupeKey = buildDedupeKey({
    clickId: lead.clickId,
    email: lead.email,
    phone: lead.phone,
    formName: lead.formName,
    submittedAt: lead.submittedAt,
  });

  const existing = await findByDedupeKey(dedupeKey);
  if (existing) return logDuplicate(existing, opts);

  const attribution = await resolveAttribution(lead);

  let created;
  try {
    created = await prisma.lead.create({
      data: {
        trackingLinkId: attribution.trackingLinkId,
        clickEventId: attribution.clickEventId,
        clickId: lead.clickId ?? null,
        name: lead.name ?? null,
        phone: lead.phone ?? null,
        email: lead.email ?? null,
        formName: lead.formName ?? null,
        pageUrl: lead.pageUrl ?? null,
        utmSource: lead.utmSource ?? null,
        utmMedium: lead.utmMedium ?? null,
        utmCampaign: lead.utmCampaign ?? null,
        utmContent: lead.utmContent ?? null,
        utmTerm: lead.utmTerm ?? null,
        submittedAt: lead.submittedAt,
        sourcePayload: opts.rawPayload,
        attributionStatus: attribution.status,
        dedupeKey,
      },
    });
  } catch (err) {
    // Two concurrent submissions for the same dedupe key: the loser lands here.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const race = await findByDedupeKey(dedupeKey);
      if (race) return logDuplicate(race, opts);
    }
    throw err;
  }

  const status = lead.clickId ? WebhookStatus.success : WebhookStatus.missing_click_id;
  await prisma.webhookLog.create({
    data: {
      provider: opts.provider,
      payload: opts.rawPayload,
      status,
      message: `Lead created (${attribution.status})`,
      leadId: created.id,
    },
  });

  return {
    leadId: created.id,
    deduped: false,
    attribution: attribution.status,
    hasClickId: Boolean(lead.clickId),
  };
}

function findByDedupeKey(dedupeKey: string) {
  return prisma.lead.findUnique({
    where: { dedupeKey },
    select: { id: true, attributionStatus: true, clickId: true },
  });
}

async function logDuplicate(
  existing: { id: string; attributionStatus: AttributionStatus; clickId: string | null },
  opts: { provider: string; rawPayload: Prisma.InputJsonValue },
): Promise<RecordLeadResult> {
  await prisma.webhookLog.create({
    data: {
      provider: opts.provider,
      payload: opts.rawPayload,
      status: WebhookStatus.duplicated,
      message: "Duplicate lead ignored",
      leadId: existing.id,
    },
  });
  return {
    leadId: existing.id,
    deduped: true,
    attribution: existing.attributionStatus,
    hasClickId: Boolean(existing.clickId),
  };
}
