import type { Prisma, PrismaClient } from "@prisma/client";
import type { ReportDocument } from "@/lib/reports/types";
import { suggestTheme } from "./dictionaries";
import { METRICS_VERSION, computeMetrics, themeLabels } from "./metrics";
import { getProjectSettings } from "./settings";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Create ThemeMapping rows for a feedback report's open-answer themes, with an
 * auto-suggested canonical theme. Rows an admin already confirmed are kept.
 */
export async function syncThemeMappings(db: Db, reportId: string, doc: ReportDocument) {
  if (doc.type !== "feedback") return;
  const labels = themeLabels(doc);
  const existing = await db.themeMapping.findMany({ where: { reportId } });
  const keep = new Set(labels.map((l) => `${l.kind}:${l.rawLabel}`));
  // Themes that disappeared from a replaced file.
  const stale = existing.filter((e) => !keep.has(`${e.kind}:${e.rawLabel}`)).map((e) => e.id);
  if (stale.length) await db.themeMapping.deleteMany({ where: { id: { in: stale } } });
  for (const l of labels) {
    const prev = existing.find((e) => e.kind === l.kind && e.rawLabel === l.rawLabel);
    if (prev?.confirmed) continue;
    await db.themeMapping.upsert({
      where: { reportId_kind_rawLabel: { reportId, kind: l.kind, rawLabel: l.rawLabel } },
      create: { reportId, kind: l.kind, rawLabel: l.rawLabel, canonical: suggestTheme(l.rawLabel) },
      update: { canonical: suggestTheme(l.rawLabel) },
    });
  }
}

/**
 * Recompute a project's ProjectMetrics from its reports (the latest report of
 * each type). Call inside the same transaction that changes a report.
 */
export async function recomputeProjectMetrics(db: Db, projectId: string) {
  const reports = await db.report.findMany({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, type: true, data: true, visibility: true, updatedAt: true, themeMappings: true },
  });
  const latest = (type: string) => reports.find((r) => r.type === type);
  const reg = latest("registration");
  const fb = latest("feedback");
  const settings = await getProjectSettings(db);

  const mapping = new Map((fb?.themeMappings ?? []).map((t) => [`${t.kind}:${t.rawLabel}`, t.canonical]));
  const computed = computeMetrics(
    {
      registration: reg?.data as unknown as ReportDocument | undefined,
      feedback: fb?.data as unknown as ReportDocument | undefined,
      themes: (kind, raw) => mapping.get(`${kind}:${raw}`) ?? null,
    },
    settings,
  );

  const docs = [reg, fb].filter(Boolean) as typeof reports;
  const service = {
    hasRegistrationReport: Boolean(reg),
    hasFeedbackReport: Boolean(fb),
    hasWarnings: docs.some((r) => ((r.data as unknown as ReportDocument).warnings?.length ?? 0) > 0),
    reportVisibilities: [...new Set(reports.map((r) => r.visibility))],
    reportsUpdatedAt: reports[0]?.updatedAt ?? null,
    metricsVersion: METRICS_VERSION,
    computedAt: new Date(),
  };
  await db.projectMetrics.upsert({
    where: { projectId },
    create: { projectId, ...computed, ...service },
    update: { ...computed, ...service },
  });
}

/** Recompute every project (after a formula change: bump METRICS_VERSION first). */
export async function recomputeAll(db: PrismaClient, onlyOutdated = false) {
  const projects = await db.project.findMany({
    // Demo projects have made-up metrics and no reports: leave them alone.
    where: {
      demo: false,
      ...(onlyOutdated ? { OR: [{ metrics: null }, { metrics: { metricsVersion: { lt: METRICS_VERSION } } }] } : {}),
    },
    select: { id: true },
  });
  for (const p of projects) await db.$transaction((tx) => recomputeProjectMetrics(tx, p.id));
  return projects.length;
}
