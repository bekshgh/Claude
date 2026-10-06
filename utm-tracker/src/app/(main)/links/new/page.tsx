import { PageHeader } from "@/components/ui/PageHeader";
import { CreateLinkForm } from "@/components/CreateLinkForm";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NewLinkPage() {
  const campaigns = await prisma.campaign.findMany({
    where: { status: { not: "archived" } },
    select: { id: true, name: true, label: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <PageHeader breadcrumb="Links" title="Create link" subtitle="Generate a new UTM-tracked short link in a few steps." />
      <CreateLinkForm campaigns={campaigns} />
    </>
  );
}
