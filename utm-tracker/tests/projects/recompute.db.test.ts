import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type Prisma } from "@prisma/client";
import { recomputeProjectMetrics, syncThemeMappings } from "@/lib/projects/recompute";
import type { ReportDocument } from "@/lib/reports/types";
import { FEEDBACK_FILE, REGISTRATION_FILE, parseFile } from "../reports/helpers";

// Needs a migrated Postgres: TEST_DATABASE_URL=postgresql://… npx vitest run
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("ProjectMetrics recompute (database)", () => {
  const db = new PrismaClient({ datasourceUrl: url });
  let projectId = "";
  let reg: ReportDocument;
  let fb: ReportDocument;

  beforeAll(async () => {
    [reg, fb] = await Promise.all([parseFile(REGISTRATION_FILE), parseFile(FEEDBACK_FILE)]);
    const type = await db.projectType.findUniqueOrThrow({ where: { key: "forum" } });
    const p = await db.project.create({ data: { slug: `test-${Date.now()}`, name: "Recompute test", typeId: type.id, status: "done" } });
    projectId = p.id;
  });

  afterAll(async () => {
    await db.report.deleteMany({ where: { projectId } });
    await db.project.delete({ where: { id: projectId } }).catch(() => null);
    await db.$disconnect();
  });

  const addReport = (doc: ReportDocument) =>
    db.$transaction(async (tx) => {
      const r = await tx.report.create({
        data: {
          slug: `test-${doc.type}-${Date.now()}`,
          type: doc.type,
          title: doc.title,
          parserVersion: doc.parserVersion,
          data: doc as unknown as Prisma.InputJsonValue,
          projectId,
        },
      });
      await syncThemeMappings(tx, r.id, doc);
      await recomputeProjectMetrics(tx, projectId);
      return r;
    });

  const metrics = () => db.projectMetrics.findUniqueOrThrow({ where: { projectId } });

  it("fills registration metrics, leaves feedback ones null", async () => {
    await addReport(reg);
    const m = await metrics();
    expect(m).toMatchObject({ registrants: 603, hasRegistrationReport: true, hasFeedbackReport: false, orgScore10: null, responseRate: null });
  });

  it("adding the feedback report updates the same row", async () => {
    const r = await addReport(fb);
    const m = await metrics();
    expect(m.hasFeedbackReport).toBe(true);
    expect(m.orgScore10).toBeCloseTo(9.47, 2);
    expect(m.responseRate).toBeCloseTo(30 / 603, 4);
    expect(m.topPainTheme).toBe("networking");

    // An admin re-maps the top pain theme → recompute picks it up.
    await db.themeMapping.updateMany({ where: { reportId: r.id, kind: "pain", rawLabel: { startsWith: "Passive format" } }, data: { canonical: "interactive", confirmed: true } });
    await db.$transaction((tx) => recomputeProjectMetrics(tx, projectId));
    expect((await metrics()).topPainTheme).toBe("interactive");

    // Re-uploading the same file keeps the confirmed mapping.
    await db.$transaction(async (tx) => {
      await syncThemeMappings(tx, r.id, fb);
      await recomputeProjectMetrics(tx, projectId);
    });
    expect((await metrics()).topPainTheme).toBe("interactive");
  });

  it("removing a report clears its metrics", async () => {
    await db.report.deleteMany({ where: { projectId, type: "feedback" } });
    await db.$transaction((tx) => recomputeProjectMetrics(tx, projectId));
    const m = await metrics();
    expect(m).toMatchObject({ hasFeedbackReport: false, orgScore10: null, topPainTheme: null, registrants: 603 });
  });
});
