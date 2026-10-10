import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAdmin, unauthorized } from "@/lib/reports/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await isAdmin())) return unauthorized();
  await prisma.savedView.delete({ where: { id: params.id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
