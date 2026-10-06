import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { tildaWebhookSchema } from "@/lib/validation";
import { buildDedupeKey } from "@/lib/utils";
import { resolveAttribution, type NormalisedLead } from "@/lib/attribution";
import { WebhookStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Tilda may post JSON or x-www-form-urlencoded / multipart. Parse all. */
async function parseBody(req: NextRequest): Promise<Record<string, any>> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return (await req.json().catch(() => ({}))) as Record<string, any>;
  }
  if (ct.includes("form")) {
    const fd = await req.formData();
    const obj: Record<string, any> = {};
    fd.forEach((v, k) => (obj[k] = typeof v === "string" ? v : v.name));
    return obj;
  }
  // Fallback: try JSON
  return (await req.json().catch(() => ({}))) as Record<string, any>;
}

function checkSecret(req: NextRequest, body: Record<string, any>): boolean {
  const expected = process.env.WEBHOOK_SECRET;
  if (!expected) return process.env.NODE_ENV !== "production"; // not configured → allow only in dev
  const fromHeader = req.headers.get("x-webhook-secret");
  const fromQuery = req.nextUrl.searchParams.get("secret");
  const fromBody = body.secret || body.token;
  return [fromHeader, fromQuery, fromBody].some((v) => v && v === expected);
}

function pick(body: Record<string, any>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    if (body[k] !== undefined && body[k] !== null && String(body[k]).trim() !== "") {
      return String(body[k]);
    }
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  const body = await parseBody(req);

  // Tilda sends a test ping like { "test": "test" } when you press "Send test".
  if (body.test !== undefined && Object.keys(body).length <= 2) {
    await prisma.webhookLog.create({
      data: { provider: "tilda", payload: body, status: WebhookStatus.success, message: "Test ping received" },
    });
    return NextResponse.json({ ok: true, message: "Test ping received" });
  }

  // --- auth ---
  if (!checkSecret(req, body)) {
    await prisma.webhookLog.create({
      data: { provider: "tilda", payload: body, status: WebhookStatus.unauthorized, message: "Bad or missing secret" },
    });
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const parsed = tildaWebhookSchema.safeParse(body);
  if (!parsed.success) {
    await prisma.webhookLog.create({
      data: { provider: "tilda", payload: body, status: WebhookStatus.failed, message: "Validation failed" },
    });
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 422 });
  }

  // --- normalise ---
  const submittedRaw = pick(body, "submittedAt", "submitted_at");
  const submittedAt = submittedRaw ? new Date(submittedRaw) : new Date();

  const lead: NormalisedLead = {
    name: pick(body, "name", "Name", "Имя"),
    phone: pick(body, "phone", "Phone", "Телефон", "tel"),
    email: pick(body, "email", "Email", "E-mail"),
    formName: pick(body, "formname", "formName", "form"),
    pageUrl: pick(body, "pageUrl", "page_url", "url"),
    clickId: pick(body, "click_id", "clickId", "clickid"),
    utmSource: pick(body, "utm_source"),
    utmMedium: pick(body, "utm_medium"),
    utmCampaign: pick(body, "utm_campaign"),
    utmContent: pick(body, "utm_content"),
    utmTerm: pick(body, "utm_term"),
    submittedAt,
  };

  const dedupeKey = buildDedupeKey({
    clickId: lead.clickId,
    email: lead.email,
    phone: lead.phone,
    formName: lead.formName,
    submittedAt,
  });

  // --- dedupe: repeated webhooks must not create duplicate leads ---
  const existing = await prisma.lead.findUnique({ where: { dedupeKey }, select: { id: true } });
  if (existing) {
    await prisma.webhookLog.create({
      data: {
        provider: "tilda",
        payload: body,
        status: WebhookStatus.duplicated,
        message: "Duplicate lead ignored",
        leadId: existing.id,
      },
    });
    return NextResponse.json({ ok: true, deduped: true, leadId: existing.id });
  }

  // --- attribution ---
  const attribution = await resolveAttribution(lead);

  const created = await prisma.lead.create({
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
      submittedAt,
      sourcePayload: body,
      attributionStatus: attribution.status,
      dedupeKey,
    },
  });

  const status = lead.clickId ? WebhookStatus.success : WebhookStatus.missing_click_id;
  await prisma.webhookLog.create({
    data: {
      provider: "tilda",
      payload: body,
      status,
      message: `Lead created (${attribution.status})`,
      leadId: created.id,
    },
  });

  return NextResponse.json({
    ok: true,
    leadId: created.id,
    attribution: attribution.status,
    hasClickId: Boolean(lead.clickId),
  });
}

// Allow GET for quick "is it alive" checks from a browser.
export async function GET() {
  return NextResponse.json({ ok: true, message: "Tilda webhook endpoint is live. Use POST." });
}
