import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { BreakdownPanel } from "@/components/charts/Charts";
import { CampaignActions } from "@/components/CampaignActions";
import { formatNumber, formatPercent, conversionRate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  const campaign = await prisma.campaign.findUnique({ where: { id: params.id } });
  if (!campaign) notFound();

  const links = await prisma.trackingLink.findMany({
    where: { utmCampaign: campaign.name },
    select: { id: true, utmSource: true, utmContent: true },
  });
  const linkIds = links.map((l) => l.id);

  const [totalClicks, uniqueClicks, totalLeads, submitsByLink] = await Promise.all([
    prisma.clickEvent.count({ where: { trackingLinkId: { in: linkIds } } }),
    prisma.clickEvent.count({ where: { trackingLinkId: { in: linkIds }, isUnique: true } }),
    prisma.lead.count({ where: { utmCampaign: campaign.name } }),
    prisma.formSubmit.groupBy({ by: ["trackingLinkId"], where: { trackingLinkId: { in: linkIds } }, _count: { _all: true } }),
  ]);
  const linkSubmits = new Map(submitsByLink.map((r) => [r.trackingLinkId, r._count._all]));
  const totalSubmits = submitsByLink.reduce((s, r) => s + r._count._all, 0);

  const cr = conversionRate(totalLeads, totalClicks);

  const srcMap = new Map<string, { clicks: number; submits: number; leads: number }>();
  for (const l of links) {
    const key = l.utmSource || "(none)";
    const r = srcMap.get(key) ?? { clicks: 0, submits: 0, leads: 0 };
    r.clicks += await prisma.clickEvent.count({ where: { trackingLinkId: l.id } });
    r.submits += linkSubmits.get(l.id) ?? 0;
    srcMap.set(key, r);
  }
  const srcLeads = await prisma.lead.groupBy({ by: ["utmSource"], where: { utmCampaign: campaign.name }, _count: { _all: true } });
  for (const row of srcLeads) {
    const key = row.utmSource || "(none)";
    const r = srcMap.get(key) ?? { clicks: 0, submits: 0, leads: 0 };
    r.leads += row._count._all;
    srcMap.set(key, r);
  }
  const bySource = Array.from(srcMap.entries())
    .map(([key, v]) => ({ key, clicks: v.clicks, submits: v.submits, leads: v.leads, cr: conversionRate(v.leads, v.clicks) }))
    .sort((a, b) => b.clicks - a.clicks);

  const cntMap = new Map<string, { clicks: number; submits: number; leads: number }>();
  for (const l of links) {
    const key = l.utmContent || "(none)";
    const r = cntMap.get(key) ?? { clicks: 0, submits: 0, leads: 0 };
    r.clicks += await prisma.clickEvent.count({ where: { trackingLinkId: l.id } });
    r.submits += linkSubmits.get(l.id) ?? 0;
    cntMap.set(key, r);
  }
  const cntLeads = await prisma.lead.groupBy({ by: ["utmContent"], where: { utmCampaign: campaign.name }, _count: { _all: true } });
  for (const row of cntLeads) {
    const key = row.utmContent || "(none)";
    const r = cntMap.get(key) ?? { clicks: 0, submits: 0, leads: 0 };
    r.leads += row._count._all;
    cntMap.set(key, r);
  }
  const byContent = Array.from(cntMap.entries())
    .map(([key, v]) => ({ key, clicks: v.clicks, submits: v.submits, leads: v.leads, cr: conversionRate(v.leads, v.clicks) }))
    .sort((a, b) => b.clicks - a.clicks);

  return (
    <>
      <PageHeader
        breadcrumb="Campaigns"
        title={campaign.label || campaign.name}
        subtitle={[campaign.type, campaign.season, `utm: ${campaign.name}`].filter(Boolean).join(" · ")}
        action={<CampaignActions id={campaign.id} status={campaign.status} />}
      />
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-5 mb-6">
        <StatCard label="Total clicks"    value={formatNumber(totalClicks)}  sub="all recorded"     accent="clicks" />
        <StatCard label="Unique clicks"   value={formatNumber(uniqueClicks)} sub="per device / IP"  accent="clicks" />
        <StatCard label="Form submits"    value={formatNumber(totalSubmits)} sub="pressed “Отправить заявку”" accent="submits" />
        <StatCard label="Leads"           value={formatNumber(totalLeads)}   sub="form submissions" accent="leads"  />
        <StatCard label="Conversion rate" value={formatPercent(cr)}          sub="clicks → leads"   accent="accent" />
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <BreakdownPanel title="By source"  head="Source"  rows={bySource}  />
        <BreakdownPanel title="By content" head="Content" rows={byContent} />
      </section>
    </>
  );
}
