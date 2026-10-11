import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { updateLinkSchema } from "@/lib/validation";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const body = await req.json().catch(() => null);
  const parsed = updateLinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  }
  const d = parsed.data;
  const link = await prisma.trackingLink.update({
    where: { id: params.id },
    data: {
      ...(d.name !== undefined && { name: d.name }),
      ...(d.destinationUrl !== undefined && { destinationUrl: d.destinationUrl }),
      ...(d.campaignId !== undefined && { campaignId: d.campaignId || null }),
      ...(d.utmSource !== undefined && { utmSource: d.utmSource || null }),
      ...(d.utmMedium !== undefined && { utmMedium: d.utmMedium || null }),
      ...(d.utmCampaign !== undefined && { utmCampaign: d.utmCampaign || null }),
      ...(d.utmContent !== undefined && { utmContent: d.utmContent || null }),
      ...(d.utmTerm !== undefined && { utmTerm: d.utmTerm || null }),
      ...(d.notes !== undefined && { notes: d.notes || null }),
      ...(d.tags !== undefined && { tags: d.tags }),
      ...(d.isActive !== undefined && { isActive: d.isActive }),
      ...(d.isArchived !== undefined && { isArchived: d.isArchived }),
    },
  });
  return NextResponse.json(link);
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  await prisma.trackingLink.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
