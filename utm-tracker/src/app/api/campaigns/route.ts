import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createCampaignSchema } from "@/lib/validation";

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { links: true } } },
  });
  return NextResponse.json(campaigns);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = createCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten().fieldErrors }, { status: 422 });
  }
  const campaign = await prisma.campaign.create({ data: parsed.data });
  return NextResponse.json(campaign, { status: 201 });
}
