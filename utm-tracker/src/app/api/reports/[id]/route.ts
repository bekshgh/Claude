import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isAdmin, unauthorized } from "@/lib/reports/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    status: z.enum(["draft", "published"]).optional(),
    visibility: z.enum(["private", "link", "public"]).optional(),
    eventName: z.string().trim().max(120).nullable().optional(),
  })
  .strict();

/** Publish / unpublish, change visibility, rename the event. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await isAdmin())) return unauthorized();
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 422 });

  const current = await prisma.report.findUnique({ where: { id: params.id }, select: { publishedAt: true } });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { status, visibility, eventName } = parsed.data;
  const report = await prisma.report.update({
    where: { id: params.id },
    data: {
      ...(status ? { status, publishedAt: status === "published" ? current.publishedAt ?? new Date() : current.publishedAt } : {}),
      ...(visibility ? { visibility } : {}),
      ...(eventName !== undefined ? { eventName: eventName || null } : {}),
    },
    select: { id: true, slug: true, status: true, visibility: true, eventName: true },
  });
  return NextResponse.json(report);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await isAdmin())) return unauthorized();
  await prisma.report.delete({ where: { id: params.id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
