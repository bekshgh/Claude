import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAdmin, unauthorized } from "@/lib/reports/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!(await isAdmin())) return unauthorized();
  await prisma.savedView.delete({ where: { id: params.id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
