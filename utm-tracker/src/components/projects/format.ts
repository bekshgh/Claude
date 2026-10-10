import type { FilterDef, Unit } from "@/lib/projects/filters/registry";
import type { DateRange, FilterValue, Range } from "@/lib/projects/filters/state";
import { seasonLabel } from "@/lib/projects/rows";

const UNIT_SUFFIX: Record<Unit, string> = { "%": "%", "/10": "/10", days: " дн.", people: "", years: " лет" };

export const STATUS_LABEL: Record<string, string> = {
  planned: "Планируется",
  registration: "Идёт регистрация",
  done: "Проведён",
  archived: "В архиве",
};

export function fmtNumber(v: number, decimals = 0): string {
  return v.toLocaleString("ru-RU", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** A stored metric value as shown to people ("4.98%" for 0.0498 with unit %). */
export function fmtMetric(v: unknown, f: Pick<FilterDef, "unit" | "scale" | "decimals">): string {
  if (v === null || v === undefined || (typeof v === "number" && Number.isNaN(v))) return "нет данных";
  if (typeof v !== "number") return String(v);
  const x = v * (f.scale ?? 1);
  return `${fmtNumber(x, f.decimals ?? (f.unit === "/10" ? 1 : 0))}${f.unit ? UNIT_SUFFIX[f.unit] : ""}`;
}

export const unitText = (u?: Unit) => (u ? UNIT_SUFFIX[u].trim() || "" : "");

const DATE_PRESET: Record<string, string> = { season: "Этот сезон", "12m": "Последние 12 месяцев", lastyear: "Прошлый год" };

export function fmtDate(iso: string | null): string {
  if (!iso) return "без даты";
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Text of an active-filter chip: "Тип: Форум, Хакатон", "Оценка ≥ 9.0/10". */
export function chipText(f: FilterDef, v: FilterValue, optionLabel: (value: string) => string): string {
  if (Array.isArray(v)) return `${f.label}: ${v.map((x) => (f.key === "season" ? seasonLabel(x) : optionLabel(x))).join(", ")}`;
  if (v === true) return f.label;
  if (typeof v === "string") return `«${v}»`;
  if (f.kind === "dateRange") {
    const d = v as DateRange;
    if (d.preset) return DATE_PRESET[d.preset];
    return `${f.label}: ${d.from ? fmtDate(d.from) : "…"} – ${d.to ? fmtDate(d.to) : "…"}`;
  }
  const r = v as Range;
  const u = f.unit ? UNIT_SUFFIX[f.unit] : "";
  if (r.min !== undefined && r.max !== undefined) return `${f.label} ${fmtNumber(r.min, f.decimals ?? 0)}–${fmtNumber(r.max, f.decimals ?? 0)}${u}`;
  if (r.min !== undefined) return `${f.label} ≥ ${fmtNumber(r.min, f.decimals ?? 0)}${u}`;
  return `${f.label} ≤ ${fmtNumber(r.max!, f.decimals ?? 0)}${u}`;
}

export { DATE_PRESET };
