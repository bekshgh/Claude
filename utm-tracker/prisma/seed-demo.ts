/**
 * DEMO data for the project filters — never run in production.
 *
 *   npm run db:seed:demo                 # ~20 demo projects + the real ÖZGE Forum S'26
 *   npm run db:seed:demo -- --count 1000 # load test
 *   npm run db:seed:demo -- --reset      # remove demo projects only
 *
 * Demo projects are flagged `demo = true` and carry made-up metrics (no reports).
 * ÖZGE Forum S'26 is built the real way: its two (sanitised) report fixtures are
 * parsed, attached to the project and the metrics are computed from them.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient, type Prisma, type ProjectFormat, type ProjectStatus } from "@prisma/client";
import { parseReport } from "../src/lib/reports/parse";
import { METRICS_VERSION } from "../src/lib/projects/metrics";
import { recomputeProjectMetrics, syncThemeMappings } from "../src/lib/projects/recompute";
import { THEMES, ZONES } from "../src/lib/projects/dictionaries";

if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
  console.error("Refusing to seed demo data in production.");
  process.exit(1);
}

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const count = Number(args[args.indexOf("--count") + 1]) || 20;

/* deterministic pseudo-random, so demo data and tests are stable */
let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const between = (a: number, b: number) => a + rnd() * (b - a);
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

const TYPES = ["forum", "case_championship", "hackathon"] as const;
const NAMES: Record<(typeof TYPES)[number], string[]> = {
  forum: ["Leaders Forum", "Youth Speak Forum", "Career Forum", "Impact Forum", "Women in Tech Forum", "Future Skills Forum"],
  case_championship: ["Business Case Cup", "Marketing Case Challenge", "Finance Case Cup", "Consulting Case Battle", "ESG Case Championship"],
  hackathon: ["HackDay", "AI Hackathon", "FinTech Hack", "EdTech Hackathon", "Green Hack"],
};
const CITIES = ["Astana", "Almaty", "Shymkent", "Karaganda"];
const TEAMS = ["AIESEC NU", "AIESEC Astana", "AIESEC Almaty", "AIESEC KBTU"];
const TAGS = ["IT", "Women in tech", "Business", "Startups", "Social impact", "Ecology", "Finance", "Marketing"];
const UNIS = ["Nazarbayev University", "Astana IT University", "KBTU", "Satbayev University", "ENU (Gumilyov)"];
const GROUPS = ["telegram", "instagram", "email", "partners", "offline", "direct"];
const SEASON_START = [new Date("2025-02-10"), new Date("2025-04-15"), new Date("2025-10-05"), new Date("2025-11-20"), new Date("2026-03-01"), new Date("2026-05-12"), new Date("2026-09-20"), new Date("2026-11-08"), new Date("2027-02-15")];

async function reset() {
  const n = await prisma.project.deleteMany({ where: { demo: true } });
  console.log(`removed ${n.count} demo projects`);
}

async function realOzge() {
  const forum = await prisma.projectType.findUniqueOrThrow({ where: { key: "forum" } });
  const project = await prisma.project.upsert({
    where: { slug: "ozge-forum-s26" },
    create: {
      slug: "ozge-forum-s26",
      name: "ÖZGE Forum S'26",
      typeId: forum.id,
      format: "offline",
      status: "done",
      startDate: new Date("2026-08-22"),
      endDate: new Date("2026-08-22"),
      city: "Astana",
      ownerTeam: "AIESEC NU",
      tags: ["Forum", "Career"],
    },
    update: {},
  });
  const dir = path.join(__dirname, "../fixtures/reports");
  for (const file of ["Ozge_S26_Reg_Form_Analysis.xlsx", "OZGE_Forum_Feedback_Form_Analysis.xlsx"]) {
    const doc = await parseReport(readFileSync(path.join(dir, file)));
    const exists = await prisma.report.findFirst({ where: { projectId: project.id, type: doc.type } });
    if (exists) continue;
    await prisma.$transaction(async (tx) => {
      const r = await tx.report.create({
        data: {
          slug: `ozge-s26-${doc.type}-demo`,
          type: doc.type,
          title: doc.title,
          eventName: doc.meta.eventName,
          status: "published",
          publishedAt: new Date(),
          visibility: "link",
          sourceFileName: file,
          parserVersion: doc.parserVersion,
          data: doc as unknown as Prisma.InputJsonValue,
          projectId: project.id,
        },
      });
      await syncThemeMappings(tx, r.id, doc);
      await recomputeProjectMetrics(tx, project.id);
    });
  }
  console.log("ÖZGE Forum S'26: reports attached, metrics computed");
}

async function demo(n: number) {
  const types = await prisma.projectType.findMany();
  const typeId = (k: string) => types.find((t) => t.key === k)!.id;
  const now = new Date();

  for (let i = 0; i < n; i++) {
    const type = TYPES[i % TYPES.length];
    const start = new Date(pick(SEASON_START).getTime() + Math.floor(between(0, 40)) * 86_400_000);
    const past = start < now;
    const status: ProjectStatus = !past ? (rnd() < 0.5 ? "planned" : "registration") : rnd() < 0.15 ? "archived" : "done";
    const name = `${pick(NAMES[type])} ${start.getFullYear() % 100 === 26 ? "'26" : `'${start.getFullYear() % 100}`}${n > 40 ? ` #${i + 1}` : ""}`;

    // Which reports exist (scenarios the presets must catch):
    const scenario = i % 10;
    const hasReg = status !== "planned" && scenario !== 9; // 9: no reports at all
    const hasFb = hasReg && past && scenario !== 3 && scenario !== 7; // 3, 7: no feedback yet
    const smallSample = scenario === 5; // feedback with very few answers
    const oneChannel = scenario === 2; // depends on one channel

    const registrants = hasReg ? Math.round(between(60, 950)) : null;
    const responses = hasFb && registrants ? (smallSample ? Math.round(between(5, 9)) : Math.round(registrants * between(0.03, 0.15))) : null;
    const zoneScores = ZONES.map((z) => ({ key: z.key, v: round(between(7.2, 9.9)) })).sort((a, b) => a.v - b.v);
    const org = hasFb ? round(between(7.6, 9.8)) : null;
    const topGroupShare = oneChannel ? round(between(0.72, 0.86)) : round(between(0.3, 0.6));

    const metrics: Prisma.ProjectMetricsCreateWithoutProjectInput = {
      registrants,
      submissions: registrants ? Math.round(registrants * between(1.01, 1.08)) : null,
      campaignDays: hasReg ? Math.round(between(7, 35)) : null,
      channelCount: hasReg ? (oneChannel ? 2 : Math.round(between(4, 16))) : null,
      responses,
      responseRate: responses && registrants ? responses / registrants : null,
      orgScore10: org,
      nps: org !== null ? round((org - 8) * 45 + between(-10, 10), 0) : null,
      composite10: org !== null ? round(org - between(0, 0.4)) : null,
      weakestZone: hasFb ? zoneScores[0].key : null,
      weakestZoneScore10: hasFb ? zoneScores[0].v : null,
      strongestZone: hasFb ? zoneScores[zoneScores.length - 1].key : null,
      strongestZoneScore10: hasFb ? zoneScores[zoneScores.length - 1].v : null,
      topPraiseTheme: hasFb ? pick(THEMES).key : null,
      topPainTheme: hasFb ? pick(THEMES).key : null,
      topChannelGroup: hasReg ? (oneChannel ? "telegram" : pick(GROUPS)) : null,
      topChannelShare: hasReg ? topGroupShare : null,
      topChannel: hasReg ? "Main mailing" : null,
      topChannelOwnShare: hasReg ? round(topGroupShare * between(0.5, 0.9)) : null,
      hhiGroups: hasReg ? round(oneChannel ? between(0.55, 0.75) : between(0.12, 0.34), 3) : null,
      concentrationLevel: hasReg ? (oneChannel ? "high" : pick(["low", "moderate", "moderate", "high"])) : null,
      peakDayShare: hasReg ? round(between(0.08, 0.35)) : null,
      isBursty: null,
      topUniversityName: hasReg ? pick(UNIS) : null,
      topUniversityShare: hasReg ? round(between(0.2, 0.65)) : null,
      newToOrgShare: hasReg ? round(between(0.35, 0.85)) : null,
      internshipShare: hasReg ? round(between(0.55, 0.92)) : null,
      avgAge: hasReg ? round(between(18.5, 23), 1) : null,
      duplicateRate: hasReg ? round(between(0.005, 0.07), 3) : null,
      audienceStage: hasReg ? pick(["y1_2", "y1_2", "y3_4", "grad"]) : null,
      ageBand: hasReg ? pick(["18–19", "20–21", "22–24"]) : null,
      hasRegistrationReport: hasReg,
      hasFeedbackReport: hasFb,
      hasWarnings: hasReg && rnd() < 0.1,
      reportVisibilities: hasReg ? [pick(["private", "link", "public"])] : [],
      reportsUpdatedAt: hasReg ? new Date(Math.min(now.getTime(), start.getTime() + 10 * 86_400_000)) : null,
      metricsVersion: METRICS_VERSION,
    };
    metrics.isBursty = metrics.peakDayShare === null || metrics.peakDayShare === undefined ? null : (metrics.peakDayShare as number) > 0.2;

    const format: ProjectFormat = type === "hackathon" ? pick(["offline", "hybrid"]) : pick(["offline", "offline", "online", "hybrid"]);
    await prisma.project.create({
      data: {
        slug: `demo-${type}-${i + 1}`,
        name,
        typeId: typeId(type),
        format,
        status,
        startDate: start,
        endDate: new Date(start.getTime() + (type === "hackathon" ? 2 : type === "case_championship" ? 7 : 1) * 86_400_000),
        city: pick(CITIES),
        venue: rnd() < 0.5 ? pick(["NU Atrium", "Astana Hub", "KBTU Hall", "Online"]) : null,
        ownerTeam: pick(TEAMS),
        tags: [...new Set([pick(TAGS), pick(TAGS)])],
        demo: true,
        metrics: status === "planned" && !hasReg ? undefined : { create: metrics },
      },
    });
  }
  console.log(`created ${n} demo projects`);
}

async function main() {
  await reset();
  if (args.includes("--reset")) return;
  await realOzge();
  await demo(count);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
