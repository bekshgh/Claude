import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAdmin, newSlug, readUpload, unauthorized } from "@/lib/reports/store";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Upload an analysis workbook → parsed draft report (preview before publishing). */
export async function POST(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const up = await readUpload(req);
  if (up instanceof NextResponse) return up;

  const eventName = up.eventName ?? up.doc.meta.eventName ?? null;
  const report = await prisma.report.create({
    data: {
      slug: newSlug(`${eventName ?? up.doc.title} ${up.doc.type}`),
      type: up.doc.type,
      title: up.doc.title,
      eventName,
      sourceFileName: up.fileName,
      parserVersion: up.doc.parserVersion,
      data: up.doc as unknown as Prisma.InputJsonValue,
    },
    select: { id: true, slug: true },
  });
  return NextResponse.json({ ...report, warnings: up.doc.warnings.length }, { status: 201 });
}
