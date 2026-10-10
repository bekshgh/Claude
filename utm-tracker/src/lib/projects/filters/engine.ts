import type { ProjectRow } from "../rows";
import { seasonOf } from "../rows";
import type { ProjectSettings } from "../settings";
import {
  COMPLETED,
  FILTERS,
  SORTS,
  filterVisibleTo,
  median,
  quantile,
  type FilterCtx,
  type FilterDef,
  type Option,
  type RelativeStats,
} from "./registry";
import type { DateRange, FilterState, FilterValue, Range } from "./state";

/**
 * In-memory filter engine over ProjectRow[]. With tens–thousands of projects
 * this is fast enough; `runQuery(rows, state, opts)` is the only entry point,
 * so it can be replaced by SQL later without touching the UI or the API.
 */

export interface FacetOption extends Option {
  count: number;
  /** why the option cannot be used (e.g. not enough projects to compare) */
  disabled?: string;
}

export interface Histogram {
  min: number;
  max: number;
  bins: number[];
  withValue: number;
}

export interface QueryResult {
  items: ProjectRow[];
  total: number;
  matched: number;
  /** Projects left out only because they have no data for an active filter. */
  hiddenNoData: number;
  hiddenBy: Record<string, number>;
  facets: Record<string, FacetOption[]>;
  histograms: Record<string, Histogram | null>;
  /** Filters that have data in at least one visible project. */
  available: Record<string, boolean>;
  /** "remove filter X → +N projects", when nothing matched */
  emptyHints: { key: string; label: string; gain: number }[];
  smallSampleIds: string[];
}

export interface QueryOptions {
  settings: ProjectSettings;
  now?: Date;
  admin: boolean;
  /** All project types (so types without projects still appear in the type filter). */
  types?: Option[];
}

const NULL = Symbol("no-data");
type Match = boolean | typeof NULL;
type Val = string | number | boolean | string[] | null;

export const normalize = (s: string) =>
  s.toLowerCase().replace(/ё/g, "е").normalize("NFKD").replace(/[̀-ͯ]/g, "");

const SEARCH_FIELDS: (keyof ProjectRow)[] = ["name", "typeName", "city", "venue", "ownerTeam", "topUniversityName"];

/** Projects the viewer may see. The site is admin-only today; the hook keeps counts honest if that changes. */
export function visibleRows(rows: ProjectRow[], admin: boolean): ProjectRow[] {
  return admin ? rows : rows.filter((r) => r.reportVisibilities?.includes("public"));
}

function relativeEligible(r: ProjectRow, field: keyof ProjectRow, s: ProjectSettings): number | null {
  const v = r[field];
  if (typeof v !== "number" || !COMPLETED.has(r.status)) return null;
  // Scores from tiny samples are not ranked together with the rest.
  if (field !== "responseRate" && (r.responses === null || r.responses < s.smallSampleN)) return null;
  return v;
}

export function relativeStats(rows: ProjectRow[], s: ProjectSettings): Record<string, RelativeStats> {
  const out: Record<string, RelativeStats> = {};
  for (const f of FILTERS) {
    if (f.kind !== "relative" || !f.relativeOf) continue;
    const byTypeAll = new Map<string, number[]>();
    const all: number[] = [];
    for (const r of rows) {
      const v = relativeEligible(r, f.relativeOf, s);
      if (v === null) continue;
      all.push(v);
      byTypeAll.set(r.typeKey, [...(byTypeAll.get(r.typeKey) ?? []), v]);
    }
    const byType = new Map<string, number[]>();
    for (const [t, vs] of byTypeAll) if (vs.length >= s.relativeMinProjects) byType.set(t, vs.sort((a, b) => a - b));
    out[f.key] = { byType, all: all.sort((a, b) => a - b) };
  }
  return out;
}

function relativeTags(f: FilterDef, r: ProjectRow, ctx: FilterCtx): string[] | null {
  const v = relativeEligible(r, f.relativeOf!, ctx.settings);
  if (v === null) return null;
  const st = ctx.relative[f.key];
  const tags: string[] = [];
  const typeVals = st.byType.get(r.typeKey);
  if (typeVals && v > median(typeVals)) tags.push("above_type_median");
  if (st.all.length >= ctx.settings.relativeMinProjects) {
    if (v >= quantile(st.all, 0.75)) tags.push("top25");
    if (v <= quantile(st.all, 0.25)) tags.push("bottom25");
    const mean = st.all.reduce((a, b) => a + b, 0) / st.all.length;
    tags.push(v > mean ? "above_avg" : "below_avg");
  }
  return tags;
}

export function valueOf(f: FilterDef, r: ProjectRow, ctx: FilterCtx): Val {
  if (f.kind === "relative") return relativeTags(f, r, ctx);
  if (f.get) return f.get(r, ctx) as Val;
  if (f.field) return r[f.field] as Val;
  return null;
}

const isNull = (v: Val) => v === null || v === undefined || (Array.isArray(v) && v.length === 0) || (typeof v === "number" && Number.isNaN(v));

function dateMatches(iso: string, d: DateRange, now: Date): boolean {
  const t = new Date(iso + "T00:00:00Z").getTime();
  if (d.preset === "season") return seasonOf(new Date(t)) === seasonOf(now);
  if (d.preset === "12m") return t <= now.getTime() && t >= now.getTime() - 365 * 86_400_000;
  if (d.preset === "lastyear") return new Date(t).getUTCFullYear() === now.getUTCFullYear() - 1;
  if (d.from && iso < d.from) return false;
  if (d.to && iso > d.to) return false;
  return true;
}

function matchOne(f: FilterDef, v: Val, want: FilterValue, r: ProjectRow, now: Date): Match {
  if (f.kind === "search") {
    const q = normalize(String(want));
    const hay = normalize([...SEARCH_FIELDS.map((k) => r[k] ?? ""), ...r.tags].join(" "));
    return q.split(/\s+/).every((w) => hay.includes(w));
  }
  if (isNull(v)) return f.nullPolicy === "include" ? false : NULL;
  switch (f.kind) {
    case "multiselect":
    case "tags":
    case "relative": {
      const set = want as string[];
      return Array.isArray(v) ? v.some((x) => set.includes(x)) : set.includes(String(v));
    }
    case "boolean":
      return v === true;
    case "range": {
      const x = (v as number) * (f.scale ?? 1);
      const rg = want as Range;
      return (rg.min === undefined || x >= rg.min - 1e-9) && (rg.max === undefined || x <= rg.max + 1e-9);
    }
    case "dateRange":
      return dateMatches(String(v), want as DateRange, now);
  }
}

function histogram(values: number[]): Histogram | null {
  if (!values.length) return null;
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const n = 12;
  const bins = new Array(n).fill(0);
  for (const v of values) bins[Math.min(n - 1, Math.floor(((v - min) / (max - min)) * n))]++;
  return { min, max, bins, withValue: values.length };
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "ru", { numeric: true });
}

export function runQuery(rows: ProjectRow[], state: FilterState, opts: QueryOptions): QueryResult {
  const now = opts.now ?? new Date();
  const visible = visibleRows(rows, opts.admin);
  const ctx: FilterCtx = { settings: opts.settings, now, relative: relativeStats(visible, opts.settings) };
  const defs = FILTERS.filter((f) => filterVisibleTo(f, opts.admin));
  const active = defs.filter((f) => state.values[f.key] !== undefined);

  // Values are computed once per (filter, row).
  const values = new Map<string, Val[]>(defs.map((f) => [f.key, visible.map((r) => valueOf(f, r, ctx))]));
  const results = active.map((f) => {
    const vs = values.get(f.key)!;
    return visible.map((r, i) => matchOne(f, vs[i], state.values[f.key], r, now));
  });

  const passes = (i: number, skip = -1) => {
    let ok = true;
    for (let k = 0; k < active.length; k++) {
      if (k === skip) continue;
      const m = results[k][i];
      if (m === false || (m === NULL && !state.nulls)) ok = false;
    }
    return ok;
  };

  const matchedIdx: number[] = [];
  const hiddenBy: Record<string, number> = {};
  let hiddenNoData = 0;
  visible.forEach((_, i) => {
    if (passes(i)) return void matchedIdx.push(i);
    // Excluded only by missing data (no explicit "false")?
    const onlyNull = results.every((res) => res[i] !== false) && results.some((res) => res[i] === NULL);
    if (onlyNull) {
      hiddenNoData++;
      active.forEach((f, k) => {
        if (results[k][i] === NULL) hiddenBy[f.key] = (hiddenBy[f.key] ?? 0) + 1;
      });
    }
  });

  // Facet counts: every option counted against all *other* active filters.
  const facets: Record<string, FacetOption[]> = {};
  const available: Record<string, boolean> = {};
  for (const f of defs) {
    const vs = values.get(f.key)!;
    available[f.key] = f.kind === "search" || f.group === "presets" || vs.some((v) => !isNull(v) && v !== false);
    if (!["multiselect", "tags", "relative", "boolean"].includes(f.kind)) continue;
    const k = active.indexOf(f);
    const base = visible.map((_, i) => i).filter((i) => passes(i, k));
    const counts = new Map<string, number>();
    for (const i of base) {
      const v = vs[i];
      if (f.kind === "boolean") {
        if (v === true) counts.set("1", (counts.get("1") ?? 0) + 1);
      } else for (const x of Array.isArray(v) ? v : isNull(v) ? [] : [String(v)]) counts.set(x, (counts.get(x) ?? 0) + 1);
    }
    let options: Option[] =
      f.key === "type"
        ? opts.types ?? [...new Map(visible.map((r) => [r.typeKey, { value: r.typeKey, label: r.typeName }])).values()]
        : typeof f.options === "function" ? f.options(visible) : f.options ?? [];
    if (f.kind === "boolean") options = [{ value: "1", label: f.label }];
    facets[f.key] = options.map((o) => ({ ...o, count: counts.get(o.value) ?? 0, ...relativeDisabled(f, o, ctx, state) }));
  }

  // Histograms over the whole visible portfolio (where projects live).
  const histograms: Record<string, Histogram | null> = {};
  for (const f of defs) {
    if (f.kind !== "range") continue;
    histograms[f.key] = histogram(values.get(f.key)!.filter((v): v is number => typeof v === "number").map((v) => v * (f.scale ?? 1)));
  }

  // Nothing found: what would each active filter give back if removed?
  const emptyHints =
    matchedIdx.length === 0
      ? active
          .map((f, k) => ({ key: f.key, label: f.label, gain: visible.filter((_, i) => passes(i, k)).length }))
          .filter((h) => h.gain > 0)
          .sort((a, b) => b.gain - a.gain)
      : [];

  const smallSampleIds = visible
    .filter((r) => r.responses !== null && r.responses < opts.settings.smallSampleN)
    .map((r) => r.id);
  const items = sortRows(matchedIdx.map((i) => visible[i]), state.sort, new Set(smallSampleIds));

  return {
    items,
    total: visible.length,
    matched: items.length,
    hiddenNoData: state.nulls ? 0 : hiddenNoData,
    hiddenBy: state.nulls ? {} : hiddenBy,
    facets,
    histograms,
    available,
    emptyHints,
    smallSampleIds,
  };
}

function relativeDisabled(f: FilterDef, o: Option, ctx: FilterCtx, state: FilterState): { disabled?: string } {
  if (f.kind !== "relative") return {};
  const st = ctx.relative[f.key];
  const types = (state.values.type as string[] | undefined) ?? [];
  const enoughType = types.length ? types.some((t) => st.byType.has(t)) : st.byType.size > 0;
  if (o.value === "above_type_median" && !enoughType) return { disabled: "недостаточно проектов своего типа для сравнения" };
  if (o.value !== "above_type_median" && st.all.length < ctx.settings.relativeMinProjects) return { disabled: "недостаточно проектов для сравнения" };
  return {};
}

/** Missing values always go last; for score sorts, small samples go after the rest. */
export function sortRows(rows: ProjectRow[], sort: FilterState["sort"], small: Set<string>): ProjectRow[] {
  const def = SORTS.find((s) => s.key === sort.key) ?? SORTS[0];
  const field = def.field!;
  return [...rows].sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    const an = av === null || av === undefined;
    const bn = bv === null || bv === undefined;
    if (an !== bn) return an ? 1 : -1;
    if (def.score) {
      const as = small.has(a.id);
      const bs = small.has(b.id);
      if (as !== bs) return as ? 1 : -1;
    }
    if (an && bn) return a.name.localeCompare(b.name, "ru");
    return compare(av, bv) * sort.dir || a.name.localeCompare(b.name, "ru");
  });
}
