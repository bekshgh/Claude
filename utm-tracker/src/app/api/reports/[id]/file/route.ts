import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isAdmin, readUpload, unauthorized } from "@/lib/reports/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Replace a report's data with a newer file of the same event (slug and link stay). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!(await isAdmin())) return unauthorized();
  const existing = await prisma.report.findUnique({ where: { id: params.id }, select: { type: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const up = await readUpload(req);
  if (up instanceof NextResponse) return up;
  if (up.doc.type !== existing.type) {
    return NextResponse.json({ error: `This report is ${existing.type}, the file is ${up.doc.type}.`, code: "type_mismatch" }, { status: 422 });
  }

  const report = await prisma.report.update({
    where: { id: params.id },
    data: {
      title: up.doc.title,
      sourceFileName: up.fileName,
      parserVersion: up.doc.parserVersion,
      data: up.doc as unknown as Prisma.InputJsonValue,
    },
    select: { id: true, slug: true },
  });
  return NextResponse.json({ ...report, warnings: up.doc.warnings.length });
}
