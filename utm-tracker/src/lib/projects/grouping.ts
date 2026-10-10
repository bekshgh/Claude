import type { ReportDocument, TableSection } from "@/lib/reports/types";

/**
 * Helpers for bulk upload: which uploaded reports belong to the same event,
 * and when that event happened — both read from the files themselves.
 */

// Words that describe the file rather than the event ("Feedback Form Analytics", "KPI Dashboard").
const GENERIC = new Set([
  "forum", "form", "forms", "analysis", "analytics", "analyse", "feedback", "registration", "registrations",
  "reg", "report", "reports", "dashboard", "kpi", "survey", "the", "of", "and",
]);

/**
 * A comparison key for event names: "ÖZGE Forum S'26" and "Özge S'26" both
 * become "ozge s26", so a feedback and a registration report of the same event
 * land in one project.
 */
export function eventKey(name: string | null | undefined): string {
  if (!name) return "";
  const words = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’`]/g, "")
    .split(/[^a-z0-9а-яё]+/i)
    .filter((w) => w && !GENERIC.has(w));
  return words.join(" ");
}

/** The event's name as written in a report ("ÖZGE Forum S'26 — Feedback Form Analytics" → "ÖZGE Forum S'26"). */
export function eventNameOf(doc: ReportDocument): string {
  return doc.meta.eventName ?? doc.title.split(/\s+[—–]\s+/)[0] ?? doc.title;
}

function table(doc: ReportDocument, sheet: string, title: RegExp): TableSection | undefined {
  return doc.sheets.find((s) => s.key === sheet)?.sections.find((s): s is TableSection => s.kind === "table" && title.test(s.title));
}

function isoDates(t: TableSection | undefined): string[] {
  if (!t) return [];
  const ci = t.columns.findIndex((c) => c.format.kind === "date");
  if (ci < 0) return [];
  return t.rows
    .filter((_, i) => i !== t.totalRow)
    .map((r) => r[ci])
    .filter((v): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v))
    .map((v) => v.slice(0, 10))
    .sort();
}

/**
 * Best guess of the event date, from dated rows in the report:
 * feedback → the first day responses came in (usually the event day);
 * registration → the last day of the campaign.
 */
export function guessEventDate(doc: ReportDocument): string | null {
  if (doc.type === "feedback") return isoDates(table(doc, "patterns", /RESPONSE TIMING/))[0] ?? null;
  const days = isoDates(table(doc, "trend", /DAY-BY-DAY/));
  return days[days.length - 1] ?? null;
}

export interface UploadSummary {
  type: ReportDocument["type"];
  title: string;
  eventName: string;
  eventKey: string;
  eventDate: string | null;
  period?: string;
  sampleSize?: number;
  warnings: number;
}

export function summarize(doc: ReportDocument): UploadSummary {
  const name = eventNameOf(doc);
  return {
    type: doc.type,
    title: doc.title,
    eventName: name,
    eventKey: eventKey(name),
    eventDate: guessEventDate(doc),
    period: doc.meta.period,
    sampleSize: doc.meta.sampleSize,
    warnings: doc.warnings.length,
  };
}
