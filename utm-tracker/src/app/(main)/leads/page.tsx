import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { prisma } from "@/lib/db";
import { LeadsWithTabs } from "@/components/LeadsWithTabs";
export const dynamic = "force-dynamic";
export default async function LeadsPage() {
  const leads = await prisma.lead.findMany({ orderBy: { submittedAt: "desc" }, take: 500, include: { trackingLink: { select: { slug: true, utmCampaign: true } } } });
  const serialized = leads.map((l) => ({ ...l, submittedAt: l.submittedAt.toISOString(), createdAt: l.createdAt.toISOString(), campaign: l.trackingLink?.utmCampaign ?? l.utmCampaign ?? null, slug: l.trackingLink?.slug ?? null }));
  return (
    <>
      <PageHeader breadcrumb="Leads" title="Leads" subtitle={`${leads.length} lead${leads.length === 1 ? "" : "s"} from forms`} />
      {leads.length === 0 ? <EmptyState title="No leads yet" description="Once your form fires its webhook, leads will appear here." ctaHref="/webhooks" ctaLabel="Set up the webhook" /> : <LeadsWithTabs leads={serialized} />}
    </>
  );
}
