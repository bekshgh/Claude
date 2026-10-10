/**
 * Normalised report document. The parser turns an analysis workbook into this
 * JSON; the report page renders only from it and knows nothing about Excel.
 *
 * Sections are generic (KPI cards, tables, callouts, definitions). How a table
 * is drawn — ranked bars, heat table, chart… — is a `view` hint chosen by the
 * report type's config, so new events with the same layout need no code.
 */

export const SCHEMA_VERSION = 1;
export const PARSER_VERSION = "1.0.0";

export type ReportType = "feedback" | "registration";

/** How to display a number. Derived from the cell's Excel number format. */
export interface ValueFormat {
  kind: "number" | "percent" | "date" | "text";
  decimals?: number;
  signed?: boolean; // "+0.00;-0.00" style
  unit?: string; // literal suffix from the format, e.g. " pp", " days"
}

export type CellValue = number | string | null;

export type Tone = "neutral" | "good" | "warn" | "critical";

export interface KpiCard {
  label: string;
  value: CellValue;
  format: ValueFormat;
  subtext?: string;
  tone?: Tone;
}

export interface Column {
  key: string;
  label: string;
  format: ValueFormat;
}

export type Row = CellValue[];

/** Rendering hint for a table, chosen by the report-type config. */
export type TableView =
  | { type: "table"; searchable?: boolean }
  | { type: "ranked"; label: number; value: number; share?: number; quote?: number }
  | { type: "heat"; from: number; to?: number; diverging?: boolean }
  | { type: "segments" } // one of several same-shaped tables shown with a switcher
  | { type: "bars"; label: number; values: number[]; stacked?: boolean; horizontal?: boolean; percent?: boolean }
  | { type: "line"; label: number; values: number[] }
  | { type: "doughnut"; label: number; value: number }
  | { type: "concentration"; label: number; value: number; status?: number };

export interface TableSection {
  kind: "table";
  id: string;
  title: string;
  subtitle?: string;
  columns: Column[];
  rows: Row[];
  /** Index of the summary row ("All respondents", "Total", …), if any. */
  totalRow?: number;
  note?: string;
  views: TableView[];
}

export interface KpiSection {
  kind: "kpiGroup";
  id: string;
  title: string;
  subtitle?: string;
  cards: KpiCard[];
}

export interface Callout {
  text: string;
  label?: string;
  tone: "info" | "good" | "warn" | "critical";
}

export interface CalloutSection {
  kind: "callouts";
  id: string;
  title: string;
  subtitle?: string;
  items: Callout[];
}

export interface DefinitionsSection {
  kind: "definitions";
  id: string;
  title: string;
  subtitle?: string;
  items: { term: string; definition: string }[];
}

export type Section = TableSection | KpiSection | CalloutSection | DefinitionsSection;

export interface SheetDoc {
  key: string; // stable tab key: "overview", "themes", …
  label: string; // tab label (ru)
  title: string; // sheet heading from the file
  subtitle?: string;
  sections: Section[];
}

export interface ParseWarning {
  sheet?: string;
  section?: string;
  message: string;
}

export interface ReportDocument {
  schemaVersion: typeof SCHEMA_VERSION;
  parserVersion: string;
  type: ReportType;
  title: string;
  subtitle?: string;
  meta: {
    eventName?: string;
    period?: string; // as written in the file, e.g. "22 Aug – 9 Sep"
    sampleSize?: number;
  };
  sheets: SheetDoc[];
  methodology: DefinitionsSection[];
  warnings: ParseWarning[];
  /** Sheets that were not imported (raw / personal data), with their size. */
  skippedSheets: { name: string; rows: number }[];
}
