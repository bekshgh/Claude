import type { Prisma, PrismaClient, ProjectMetrics } from "@prisma/client";

/**
 * One project as the filters see it: the project's own fields plus its
 * ProjectMetrics, flattened. Loaded with a single query (no N+1).
 */
type MetricFields = Omit<ProjectMetrics, "projectId" | "computedAt" | "metricsVersion" | "reportsUpdatedAt">;
type Nullable<T> = { [K in keyof T]: T[K] | null };

export interface ProjectRow extends Nullable<MetricFields> {
  id: string;
  slug: string;
  name: string;
  typeKey: string;
  typeName: string;
  format: string | null;
  status: string;
  startDate: string | null; // ISO date
  endDate: string | null;
  city: string | null;
  venue: string | null;
  ownerTeam: string | null;
  tags: string[];
  demo: boolean;
  reportsUpdatedAt: string | null;
  /** Derived: "2026-autumn" from the start date. */
  season: string | null;
  hasMetrics: boolean;
}

const SEASONS = ["winter", "spring", "summer", "autumn"] as const;
const SEASON_NAME: Record<string, string> = { winter: "Winter", spring: "Spring", summer: "Summer", autumn: "Autumn" };

/** Season of a date. December belongs to the winter of the next year. */
export function seasonOf(d: Date): string {
  const m = d.getUTCMonth();
  const year = d.getUTCFullYear() + (m === 11 ? 1 : 0);
  const s = m === 11 || m <= 1 ? "winter" : m <= 4 ? "spring" : m <= 7 ? "summer" : "autumn";
  return `${year}-${s}`;
}

export function seasonLabel(key: string): string {
  const [y, s] = key.split("-");
  return `${SEASON_NAME[s] ?? s} ${y}`;
}

/** Sort key for seasons: 2026-autumn > 2026-summer. */
export function seasonOrder(key: string): number {
  const [y, s] = key.split("-");
  return Number(y) * 10 + SEASONS.indexOf(s as (typeof SEASONS)[number]);
}

const projectInclude = { type: true, metrics: true } satisfies Prisma.ProjectInclude;
type ProjectWithMetrics = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

const METRIC_KEYS = [
  "registrants", "submissions", "campaignDays", "channelCount", "responses", "responseRate",
  "orgScore10", "nps", "composite10", "weakestZone", "weakestZoneScore10", "strongestZone",
  "strongestZoneScore10", "topPraiseTheme", "topPainTheme", "topChannelGroup", "topChannelShare",
  "topChannel", "topChannelOwnShare", "hhiGroups", "concentrationLevel", "peakDayShare", "isBursty",
  "topUniversityName", "topUniversityShare", "newToOrgShare", "internshipShare", "avgAge",
  "duplicateRate", "audienceStage", "ageBand", "hasRegistrationReport", "hasFeedbackReport",
  "hasWarnings", "reportVisibilities",
] as const satisfies readonly (keyof MetricFields)[];

export function toRow(p: ProjectWithMetrics): ProjectRow {
  const m = p.metrics;
  const metrics = Object.fromEntries(METRIC_KEYS.map((k) => [k, m ? m[k] : null])) as Nullable<MetricFields>;
  return {
    ...metrics,
    hasRegistrationReport: m?.hasRegistrationReport ?? false,
    hasFeedbackReport: m?.hasFeedbackReport ?? false,
    hasWarnings: m?.hasWarnings ?? false,
    reportVisibilities: m?.reportVisibilities ?? [],
    id: p.id,
    slug: p.slug,
    name: p.name,
    typeKey: p.type.key,
    typeName: p.type.name,
    format: p.format,
    status: p.status,
    startDate: p.startDate?.toISOString().slice(0, 10) ?? null,
    endDate: p.endDate?.toISOString().slice(0, 10) ?? null,
    city: p.city,
    venue: p.venue,
    ownerTeam: p.ownerTeam,
    tags: p.tags,
    demo: p.demo,
    reportsUpdatedAt: m?.reportsUpdatedAt?.toISOString() ?? null,
    season: p.startDate ? seasonOf(p.startDate) : null,
    hasMetrics: Boolean(m),
  };
}

export async function loadProjectRows(db: PrismaClient | Prisma.TransactionClient): Promise<ProjectRow[]> {
  const projects = await db.project.findMany({ include: projectInclude, orderBy: { startDate: "desc" } });
  return projects.map(toRow);
}
