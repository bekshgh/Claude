import { PageHeader } from "@/components/ui/PageHeader";
import { prisma } from "@/lib/db";
import { DataManager } from "@/components/DataManager";

export const dynamic = "force-dynamic";

export default async function DataPage() {
  const [clicks, leads, links, campaigns, webhookLogs] = await Promise.all([
    prisma.clickEvent.count(),
    prisma.lead.count(),
    prisma.trackingLink.count(),
    prisma.campaign.findMany({ select: { id: true, name: true, label: true } }),
    prisma.webhookLog.count(),
  ]);

  return (
    <>
      <PageHeader
        breadcrumb="Data"
        title="Data management"
        subtitle="Delete clicks, leads, links or campaigns. Actions are irreversible."
      />
      <DataManager
        stats={{ clicks, leads, links, campaigns: campaigns.length, webhookLogs }}
        campaigns={campaigns}
      />
    </>
  );
}
