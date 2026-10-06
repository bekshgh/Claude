import { PageHeader } from "@/components/ui/PageHeader";
import { CampaignManager } from "@/components/CampaignManager";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { links: true } } },
  });

  const rows = campaigns.map((c) => ({
    id: c.id, name: c.name, label: c.label, description: c.description,
    funnel: c.funnel, season: c.season, type: c.type, status: c.status,
    linkCount: c._count.links,
  }));

  return (
    <>
      <PageHeader breadcrumb="Campaigns" title="Campaigns" subtitle={`${rows.length} campaign${rows.length === 1 ? "" : "s"} total`} />
      <CampaignManager campaigns={rows} />
    </>
  );
}
