import { z } from "zod";
import { FILTERS, FILTER_BY_KEY, SORTS, filterVisibleTo, type FilterDef } from "./registry";

/**
 * Filter state ⇄ URL. Short stable keys, no JSON:
 *   ?type=forum,hackathon&season=2026-autumn&score10=9..10&enough=1&sort=-date
 * Unknown parameters and invalid values are dropped, never thrown.
 */

export type Range = { min?: number; max?: number };
export type DateRange = { preset?: DatePreset; from?: string; to?: string };
export type DatePreset = "season" | "12m" | "lastyear";
export type FilterValue = string | string[] | Range | true | DateRange;

export interface FilterState {
  values: Record<string, FilterValue>;
  sort: { key: string; dir: 1 | -1 };
  /** Show projects that have no data for the active numeric filters. */
  nulls: boolean;
  view: "cards" | "table";
  /** Projects picked for comparison (slugs). */
  cmp: string[];
}

export const DEFAULT_SORT = { key: "date", dir: -1 as const };

export const emptyState = (): FilterState => ({ values: {}, sort: { ...DEFAULT_SORT }, nulls: false, view: "cards", cmp: [] });

const num = z.coerce.number().finite();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const listItem = z.string().trim().min(1).max(80).regex(/^[^,<>"]+$/);
const slugItem = z.string().regex(/^[a-z0-9-]{1,80}$/);

type Input = URLSearchParams | Record<string, string | string[] | undefined>;

function get(input: Input, key: string): string | undefined {
  if (input instanceof URLSearchParams) return input.get(key) ?? undefined;
  const v = input[key];
  return Array.isArray(v) ? v[0] : v;
}

function staticOptions(f: FilterDef): Set<string> | null {
  return Array.isArray(f.options) ? new Set(f.options.map((o) => o.value)) : null;
}

export function parseRange(raw: string): Range | null {
  const m = /^(-?[\d.]*)\.\.(-?[\d.]*)$/.exec(raw.trim());
  if (!m) return null;
  const min = m[1] ? num.safeParse(m[1]) : null;
  const max = m[2] ? num.safeParse(m[2]) : null;
  if ((min && !min.success) || (max && !max.success)) return null;
  const r: Range = {};
  if (min?.success) r.min = min.data;
  if (max?.success) r.max = max.data;
  if (r.min === undefined && r.max === undefined) return null;
  if (r.min !== undefined && r.max !== undefined && r.min > r.max) return null;
  return r;
}

function parseValue(f: FilterDef, raw: string): FilterValue | null {
  switch (f.kind) {
    case "search": {
      const s = raw.trim().slice(0, 100);
      return s ? s : null;
    }
    case "multiselect":
    case "tags":
    case "relative": {
      const allowed = staticOptions(f);
      const items = [...new Set(raw.split(",").map((x) => x.trim()))].filter(
        (x) => listItem.safeParse(x).success && (!allowed || allowed.has(x)),
      );
      return items.length ? items : null;
    }
    case "range":
      return parseRange(raw);
    case "boolean":
      return raw === "1" || raw === "true" ? true : null;
    case "dateRange": {
      if (raw === "season" || raw === "12m" || raw === "lastyear") return { preset: raw };
      const [from, to] = raw.split("..");
      const d: DateRange = {};
      if (from && isoDate.safeParse(from).success) d.from = from;
      if (to && isoDate.safeParse(to).success) d.to = to;
      return d.from || d.to ? d : null;
    }
  }
}

export function parseState(input: Input, admin = true): FilterState {
  const state = emptyState();
  for (const f of FILTERS) {
    if (!filterVisibleTo(f, admin)) continue;
    const raw = get(input, f.key);
    if (raw === undefined) continue;
    const v = parseValue(f, raw);
    if (v !== null) state.values[f.key] = v;
  }
  const sort = get(input, "sort");
  if (sort) {
    const dir = sort.startsWith("-") ? -1 : 1;
    const key = sort.replace(/^-/, "");
    if (SORTS.some((s) => s.key === key)) state.sort = { key, dir };
  }
  state.nulls = get(input, "nulls") === "1";
  state.view = get(input, "view") === "table" ? "table" : "cards";
  const cmp = get(input, "cmp");
  if (cmp) state.cmp = [...new Set(cmp.split(","))].filter((s) => slugItem.safeParse(s).success).slice(0, 4);
  return state;
}

const fmtNum = (n: number) => String(+n.toFixed(4));

export function serializeValue(f: FilterDef, v: FilterValue): string {
  if (Array.isArray(v)) return v.join(",");
  if (v === true) return "1";
  if (typeof v === "string") return v;
  if (f.kind === "dateRange") {
    const d = v as DateRange;
    return d.preset ?? `${d.from ?? ""}..${d.to ?? ""}`;
  }
  const r = v as Range;
  return `${r.min !== undefined ? fmtNum(r.min) : ""}..${r.max !== undefined ? fmtNum(r.max) : ""}`;
}

/** State → query string (registry order, defaults omitted). */
export function toQuery(state: FilterState): string {
  const p = new URLSearchParams();
  for (const f of FILTERS) {
    const v = state.values[f.key];
    if (v !== undefined) p.set(f.key, serializeValue(f, v));
  }
  if (state.sort.key !== DEFAULT_SORT.key || state.sort.dir !== DEFAULT_SORT.dir) {
    p.set("sort", `${state.sort.dir === -1 ? "-" : ""}${state.sort.key}`);
  }
  if (state.nulls) p.set("nulls", "1");
  if (state.view !== "cards") p.set("view", state.view);
  if (state.cmp.length) p.set("cmp", state.cmp.join(","));
  return p.toString().replace(/%2C/g, ",");
}

/** Immutable helpers for the UI. */
export function withValue(state: FilterState, key: string, v: FilterValue | null): FilterState {
  const values = { ...state.values };
  if (v === null || (Array.isArray(v) && v.length === 0)) delete values[key];
  else values[key] = v;
  return { ...state, values, cmp: state.cmp };
}

export function activeKeys(state: FilterState): string[] {
  return FILTERS.filter((f) => state.values[f.key] !== undefined).map((f) => f.key);
}

export { FILTER_BY_KEY };
