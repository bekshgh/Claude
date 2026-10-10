import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Thresholds behind presets and badges. Defaults live here; an admin can
 * override them (AppSetting "projects.thresholds") without a deploy.
 */
export interface ProjectSettings {
  /** "Enough responses": n ≥ minResponses AND response rate ≥ minResponseRate. */
  minResponses: number;
  minResponseRate: number;
  /** Below this many responses a score gets a "small sample" badge and is not ranked with the rest. */
  smallSampleN: number;
  /** A campaign is "bursty" when one day brings more than this share of registrations. */
  burstyPeakShare: number;
  /** "Needs attention": weakest zone below this (/10) … */
  attentionZone10: number;
  /** … or response rate below this. */
  attentionResponseRate: number;
  /** "No feedback": held more than this many days ago. */
  noFeedbackDays: number;
  /** Relative filters need at least this many projects of the same type. */
  relativeMinProjects: number;
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  minResponses: 30,
  minResponseRate: 0.05,
  smallSampleN: 10,
  burstyPeakShare: 0.2,
  attentionZone10: 8.5,
  attentionResponseRate: 0.05,
  noFeedbackDays: 7,
  relativeMinProjects: 4,
};

export const SETTINGS_KEY = "projects.thresholds";

type Db = PrismaClient | Prisma.TransactionClient;

export async function getProjectSettings(db: Db): Promise<ProjectSettings> {
  const row = await db.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
  const saved = (row?.value ?? {}) as Partial<ProjectSettings>;
  const out = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof ProjectSettings)[]) {
    if (typeof saved[k] === "number" && Number.isFinite(saved[k])) out[k] = saved[k] as number;
  }
  return out;
}
