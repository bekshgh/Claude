import { prisma } from "@/lib/db";
import { conversionRate } from "@/lib/utils";

export type RangeKey = "7d" | "30d" | "90d" | "all";

export function rangeToDate(range: RangeKey): Date | null {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : null;
  if (days === null) return null;
  return new Date(Date.now() - days * 86_400_000);
}

export async function getOverview(range: RangeKey) {
  const since = rangeToDate(range);
  const clickWhere = since ? { timestamp: { gte: since } } : {};
  const leadWhere = since ? { submittedAt: { gte: since } } : {};

  const [totalClicks, uniqueClicks, totalSubmits, totalLeads, activeCampaigns] = await Promise.all([
    prisma.clickEvent.count({ where: clickWhere }),
    prisma.clickEvent.count({ where: { ...clickWhere, isUnique: true } }),
    prisma.formSubmit.count({ where: leadWhere }),
    prisma.lead.count({ where: leadWhere }),
    prisma.campaign.count({ where: { status: "active" } }),
  ]);

  return {
    totalClicks,
    uniqueClicks,
    totalSubmits,
    totalLeads,
    activeCampaigns,
    submitRate: conversionRate(totalSubmits, totalClicks),
    conversionRate: conversionRate(totalLeads, totalClicks),
  };
}

/** Daily clicks, submits & leads series for the line chart. */
export async function getTimeSeries(range: RangeKey) {
  const since = rangeToDate(range) ?? new Date(Date.now() - 30 * 86_400_000);
  const [clicks, submits, leads] = await Promise.all([
    prisma.clickEvent.findMany({
      where: { timestamp: { gte: since } },
      select: { timestamp: true },
    }),
    prisma.formSubmit.findMany({
      where: { submittedAt: { gte: since } },
      select: { submittedAt: true },
    }),
    prisma.lead.findMany({
      where: { submittedAt: { gte: since } },
      select: { submittedAt: true },
    }),
  ]);

  type Day = { date: string; clicks: number; submits: number; leads: number };
  const map = new Map<string, Day>();
  const empty = (k: string): Day => ({ date: k, clicks: 0, submits: 0, leads: 0 });
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);

  // seed every day in range so the chart has no gaps
  const start = new Date(since);
  for (let t = start.getTime(); t <= Date.now(); t += 86_400_000) {
    const k = dayKey(new Date(t));
    map.set(k, empty(k));
  }
  for (const c of clicks) {
    const k = dayKey(c.timestamp);
    const row = map.get(k) ?? empty(k);
    row.clicks++;
    map.set(k, row);
  }
  for (const s of submits) {
    const k = dayKey(s.submittedAt);
    const row = map.get(k) ?? empty(k);
    row.submits++;
    map.set(k, row);
  }
  for (const l of leads) {
    const k = dayKey(l.submittedAt);
    const row = map.get(k) ?? empty(k);
    row.leads++;
    map.set(k, row);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

interface Breakdown {
  key: string;
  clicks: number;
  submits: number;
  leads: number;
  cr: number;
}

async function breakdownBy(field: "utmSource" | "utmCampaign" | "utmContent", range: RangeKey) {
  const since = rangeToDate(range);
  const links = await prisma.trackingLink.findMany({
    select: {
      id: true,
      utmSource: true,
      utmCampaign: true,
      utmContent: true,
      _count: {
        select: {
          clicks: since ? { where: { timestamp: { gte: since } } } : true,
          submits: since ? { where: { submittedAt: { gte: since } } } : true,
          leads: since ? { where: { submittedAt: { gte: since } } } : true,
        },
      },
    },
  });

  const agg = new Map<string, { clicks: number; submits: number; leads: number }>();
  for (const l of links) {
    const key = (l[field] || "(none)") as string;
    const row = agg.get(key) ?? { clicks: 0, submits: 0, leads: 0 };
    row.clicks += l._count.clicks;
    row.submits += l._count.submits;
    row.leads += l._count.leads;
    agg.set(key, row);
  }

  return Array.from(agg.entries())
    .map(([key, v]): Breakdown => ({ key, clicks: v.clicks, submits: v.submits, leads: v.leads, cr: conversionRate(v.leads, v.clicks) }))
    .sort((a, b) => b.clicks - a.clicks || b.leads - a.leads);
}

export const getBySource = (r: RangeKey) => breakdownBy("utmSource", r);
export const getByCampaign = (r: RangeKey) => breakdownBy("utmCampaign", r);
export const getByContent = (r: RangeKey) => breakdownBy("utmContent", r);

export async function getRecentClicks(limit = 10) {
  return prisma.clickEvent.findMany({
    orderBy: { timestamp: "desc" },
    take: limit,
    include: { trackingLink: { select: { slug: true, utmSource: true } } },
  });
}

export async function getRecentLeads(limit = 10) {
  return prisma.lead.findMany({
    orderBy: { submittedAt: "desc" },
    take: limit,
  });
}

export async function getLinkStats(range: RangeKey) {
  const since = rangeToDate(range);
  const links = await prisma.trackingLink.findMany({
    where: { isArchived: false },
    orderBy: { createdAt: "desc" },
    include: {
      campaign: { select: { name: true, label: true } },
      _count: {
        select: {
          clicks: since ? { where: { timestamp: { gte: since } } } : true,
          submits: since ? { where: { submittedAt: { gte: since } } } : true,
          leads: since ? { where: { submittedAt: { gte: since } } } : true,
        },
      },
    },
  });
  return links.map((l) => ({
    ...l,
    clicks: l._count.clicks,
    submits: l._count.submits,
    leads: l._count.leads,
    cr: conversionRate(l._count.leads, l._count.clicks),
  }));
}

export async function getWebhookHealth() {
  const [last, totals] = await Promise.all([
    prisma.webhookLog.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.webhookLog.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  return { last, totals };
}
