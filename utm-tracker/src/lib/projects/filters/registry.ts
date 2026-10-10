import {
  CHANNEL_GROUPS,
  CONCENTRATION,
  STAGES,
  THEMES,
  ZONES,
  type DictEntry,
} from "../dictionaries";
import type { ProjectRow } from "../rows";
import { seasonLabel, seasonOrder } from "../rows";
import type { ProjectSettings } from "../settings";

/**
 * THE list of project filters. The panel UI, URL parsing / building,
 * validation, matching, facet counts, histograms and presets are all derived
 * from these entries — a new filter is one entry here (plus, if needed, a
 * ProjectMetrics column). Inside one filter values are OR-ed, filters are AND-ed.
 */

export type FilterKind = "search" | "multiselect" | "tags" | "range" | "boolean" | "dateRange" | "relative";
export type FilterGroup = "main" | "context" | "scale" | "results" | "acquisition" | "relative" | "admin" | "presets";
export type Unit = "%" | "/10" | "days" | "people" | "years";

export interface Option {
  value: string;
  label: string;
}

/** Portfolio statistics for relative filters, computed once per query. */
export interface RelativeStats {
  /** per type: sorted eligible values; absent when the type has too few projects */
  byType: Map<string, number[]>;
  /** all eligible values, sorted */
  all: number[];
}

export interface FilterCtx {
  settings: ProjectSettings;
  now: Date;
  relative: Record<string, RelativeStats>;
}

type Value = string | number | boolean | string[] | null;

export interface FilterDef {
  key: string; // also the URL parameter — short and stable
  label: string;
  group: FilterGroup;
  kind: FilterKind;
  /** Where the value comes from: a row field, or a derived getter. */
  field?: keyof ProjectRow;
  get?: (row: ProjectRow, ctx: FilterCtx) => Value;
  appliesTo: "all" | string[]; // project type keys
  nullPolicy: "exclude" | "include";
  unit?: Unit;
  /** stored value × scale = shown value (shares are stored 0..1, shown in %) */
  scale?: number;
  decimals?: number;
  visibility?: "public" | "admin";
  defaultVisible?: boolean;
  help?: string;
  /** multiselect / tags / relative options; a function derives them from the data */
  options?: Option[] | ((rows: ProjectRow[]) => Option[]);
  /** quick buckets for ranges, in shown units */
  buckets?: { label: string; min?: number; max?: number }[];
  /** relative filters: which field they compare */
  relativeOf?: keyof ProjectRow;
}

const dict = (d: DictEntry[]): Option[] => d.map((x) => ({ value: x.key, label: x.label }));
const distinct = (field: keyof ProjectRow) => (rows: ProjectRow[]): Option[] =>
  [...new Set(rows.map((r) => r[field]).filter((v): v is string => typeof v === "string" && v !== ""))]
    .sort((a, b) => a.localeCompare(b, "ru"))
    .map((v) => ({ value: v, label: v }));

export const COMPLETED = new Set(["done", "archived"]);

export const RELATIVE_OPTIONS: Option[] = [
  { value: "above_type_median", label: "Лучше медианы своего типа" },
  { value: "top25", label: "Топ-25% среди завершённых" },
  { value: "bottom25", label: "Нижние 25% среди завершённых" },
  { value: "above_avg", label: "Выше среднего по портфелю" },
  { value: "below_avg", label: "Ниже среднего по портфелю" },
];

/** Enough responses to trust the scores: n ≥ min AND response rate ≥ min. */
export function enoughSample(r: ProjectRow, s: ProjectSettings): boolean | null {
  if (r.responses === null || r.responseRate === null) return null;
  return r.responses >= s.minResponses && r.responseRate >= s.minResponseRate;
}

const daysSince = (iso: string | null, now: Date) => (iso ? (now.getTime() - new Date(iso).getTime()) / 86_400_000 : null);

export const FILTERS: FilterDef[] = [
  /* ─── A. main ─────────────────────────────────────────────── */
  { key: "q", label: "Поиск", group: "main", kind: "search", appliesTo: "all", nullPolicy: "include", defaultVisible: true,
    help: "По названию, типу, тегам, городу и команде. Регистр и ё/е не важны." },
  { key: "type", label: "Тип проекта", group: "main", kind: "multiselect", field: "typeKey", appliesTo: "all", nullPolicy: "exclude", defaultVisible: true },
  { key: "date", label: "Период", group: "main", kind: "dateRange", field: "startDate", appliesTo: "all", nullPolicy: "exclude", defaultVisible: true,
    help: "По дате проведения." },
  { key: "season", label: "Сезон", group: "main", kind: "multiselect", field: "season", appliesTo: "all", nullPolicy: "exclude", defaultVisible: true,
    options: (rows) => [...new Set(rows.map((r) => r.season).filter((s): s is string => Boolean(s)))]
      .sort((a, b) => seasonOrder(b) - seasonOrder(a))
      .map((s) => ({ value: s, label: seasonLabel(s) })) },
  { key: "status", label: "Статус", group: "main", kind: "multiselect", field: "status", appliesTo: "all", nullPolicy: "exclude", defaultVisible: true,
    options: [
      { value: "planned", label: "Планируется" },
      { value: "registration", label: "Идёт регистрация" },
      { value: "done", label: "Проведён" },
      { value: "archived", label: "В архиве" },
    ] },
  { key: "data", label: "Данные", group: "main", kind: "multiselect", appliesTo: "all", nullPolicy: "include", defaultVisible: true,
    help: "Какие отчёты загружены по проекту.",
    get: (r) => {
      const v: string[] = [];
      if (r.hasRegistrationReport) v.push("reg");
      if (r.hasFeedbackReport) v.push("fb");
      if (r.hasRegistrationReport && r.hasFeedbackReport) v.push("both");
      if (!r.hasRegistrationReport && !r.hasFeedbackReport) v.push("none");
      return v;
    },
    options: [
      { value: "reg", label: "Есть отчёт по регистрации" },
      { value: "fb", label: "Есть отчёт по фидбэку" },
      { value: "both", label: "Есть оба" },
      { value: "none", label: "Нет отчётов" },
    ] },

  /* ─── B. context ──────────────────────────────────────────── */
  { key: "format", label: "Формат", group: "context", kind: "multiselect", field: "format", appliesTo: "all", nullPolicy: "exclude",
    options: [{ value: "offline", label: "Офлайн" }, { value: "online", label: "Онлайн" }, { value: "hybrid", label: "Гибрид" }] },
  { key: "city", label: "Город", group: "context", kind: "multiselect", field: "city", appliesTo: "all", nullPolicy: "exclude", options: distinct("city") },
  { key: "venue", label: "Площадка", group: "context", kind: "multiselect", field: "venue", appliesTo: "all", nullPolicy: "exclude", options: distinct("venue") },
  { key: "team", label: "Команда", group: "context", kind: "multiselect", field: "ownerTeam", appliesTo: "all", nullPolicy: "exclude", options: distinct("ownerTeam") },
  { key: "tags", label: "Теги", group: "context", kind: "tags", field: "tags", appliesTo: "all", nullPolicy: "exclude",
    options: (rows) => [...new Set(rows.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b, "ru")).map((t) => ({ value: t, label: t })) },
  { key: "stage", label: "Преобладающий курс", group: "context", kind: "multiselect", field: "audienceStage", appliesTo: "all", nullPolicy: "exclude",
    options: dict(STAGES), help: "Самая большая группа участников по курсу, из отчёта по регистрации." },
  { key: "age", label: "Возрастная группа", group: "context", kind: "multiselect", field: "ageBand", appliesTo: "all", nullPolicy: "exclude",
    options: distinct("ageBand"), help: "Самая частая возрастная группа регистрантов." },

  /* ─── C. scale ────────────────────────────────────────────── */
  { key: "regs", label: "Регистрации", group: "scale", kind: "range", field: "registrants", appliesTo: "all", nullPolicy: "exclude", unit: "people",
    help: "Уникальные регистранты после удаления дубликатов.",
    buckets: [{ label: "<100", max: 99 }, { label: "100–300", min: 100, max: 300 }, { label: "300–600", min: 300, max: 600 }, { label: "600+", min: 600 }] },
  { key: "resp", label: "Отклики на фидбэк", group: "scale", kind: "range", field: "responses", appliesTo: "all", nullPolicy: "exclude", unit: "people" },
  { key: "rr", label: "Доля откликнувшихся", group: "scale", kind: "range", field: "responseRate", appliesTo: "all", nullPolicy: "exclude", unit: "%", scale: 100, decimals: 1,
    help: "Ответы на фидбэк ÷ уникальные регистранты." },
  { key: "days", label: "Длительность кампании", group: "scale", kind: "range", field: "campaignDays", appliesTo: "all", nullPolicy: "exclude", unit: "days" },
  { key: "channels", label: "Число каналов", group: "scale", kind: "range", field: "channelCount", appliesTo: "all", nullPolicy: "exclude" },

  /* ─── D. results ──────────────────────────────────────────── */
  { key: "score10", label: "Оценка организации", group: "results", kind: "range", field: "orgScore10", appliesTo: "all", nullPolicy: "exclude", unit: "/10", decimals: 1 },
  { key: "nps", label: "NPS-прокси", group: "results", kind: "range", field: "nps", appliesTo: "all", nullPolicy: "exclude",
    help: "NPS здесь прокси: % оценок 9–10 минус % оценок ≤6 по вопросу об организации." },
  { key: "comp10", label: "Композитный балл", group: "results", kind: "range", field: "composite10", appliesTo: "all", nullPolicy: "exclude", unit: "/10", decimals: 1,
    help: "Среднее всех оценок, приведённых к /10." },
  { key: "weak", label: "Самая слабая зона", group: "results", kind: "multiselect", field: "weakestZone", appliesTo: "all", nullPolicy: "exclude", options: dict(ZONES),
    help: "Оцениваемая зона с минимальным баллом в проекте." },
  { key: "strong", label: "Самая сильная зона", group: "results", kind: "multiselect", field: "strongestZone", appliesTo: "all", nullPolicy: "exclude", options: dict(ZONES) },
  { key: "praise", label: "Чаще всего хвалили", group: "results", kind: "multiselect", field: "topPraiseTheme", appliesTo: "all", nullPolicy: "exclude", options: dict(THEMES) },
  { key: "pain", label: "Чаще всего критиковали", group: "results", kind: "multiselect", field: "topPainTheme", appliesTo: "all", nullPolicy: "exclude", options: dict(THEMES) },
  { key: "enough", label: "Только с достаточным числом откликов", group: "results", kind: "boolean", appliesTo: "all", nullPolicy: "exclude",
    get: (r, ctx) => enoughSample(r, ctx.settings),
    help: "Порог задаётся в настройках (по умолчанию n ≥ 30 и не меньше 5% регистрантов)." },

  /* ─── E. acquisition & audience ───────────────────────────── */
  { key: "channel", label: "Главный канал", group: "acquisition", kind: "multiselect", field: "topChannelGroup", appliesTo: "all", nullPolicy: "exclude", options: dict(CHANNEL_GROUPS) },
  { key: "conc", label: "Зависимость от одного канала", group: "acquisition", kind: "multiselect", field: "concentrationLevel", appliesTo: "all", nullPolicy: "exclude",
    options: dict(CONCENTRATION), help: "Индекс концентрации HHI по группам каналов: <0.15 низкая, 0.15–0.25 умеренная, >0.25 высокая." },
  { key: "campaign", label: "Тип кампании", group: "acquisition", kind: "multiselect", appliesTo: "all", nullPolicy: "exclude",
    get: (r) => (r.isBursty === null ? null : r.isBursty ? "burst" : "even"),
    options: [{ value: "burst", label: "Пиковая" }, { value: "even", label: "Ровная" }],
    help: "Пиковая — больше 20% регистраций пришло за один день (порог в настройках)." },
  { key: "uni", label: "Доля главного вуза", group: "acquisition", kind: "range", field: "topUniversityShare", appliesTo: "all", nullPolicy: "exclude", unit: "%", scale: 100,
    help: "Доля самого частого вуза среди регистрантов; название вуза — из отчёта." },
  { key: "newbies", label: "Доля новых в AIESEC", group: "acquisition", kind: "range", field: "newToOrgShare", appliesTo: ["forum", "case_championship"], nullPolicy: "exclude", unit: "%", scale: 100 },
  { key: "intern", label: "Интерес к стажировкам", group: "acquisition", kind: "range", field: "internshipShare", appliesTo: ["forum", "case_championship"], nullPolicy: "exclude", unit: "%", scale: 100 },
  { key: "avgage", label: "Средний возраст", group: "acquisition", kind: "range", field: "avgAge", appliesTo: "all", nullPolicy: "exclude", unit: "years", decimals: 1 },
  { key: "dup", label: "Доля дубликатов", group: "acquisition", kind: "range", field: "duplicateRate", appliesTo: "all", nullPolicy: "exclude", unit: "%", scale: 100, decimals: 1,
    help: "Повторные отправки формы ÷ все отправки. Показатель качества данных." },

  /* ─── F. relative ─────────────────────────────────────────── */
  { key: "relscore", label: "Оценка относительно других", group: "relative", kind: "relative", relativeOf: "orgScore10", appliesTo: "all", nullPolicy: "exclude",
    options: RELATIVE_OPTIONS, help: "Сравнение только среди завершённых проектов; малые выборки не участвуют." },
  { key: "relnps", label: "NPS относительно других", group: "relative", kind: "relative", relativeOf: "nps", appliesTo: "all", nullPolicy: "exclude", options: RELATIVE_OPTIONS },
  { key: "relrr", label: "Отклик относительно других", group: "relative", kind: "relative", relativeOf: "responseRate", appliesTo: "all", nullPolicy: "exclude", options: RELATIVE_OPTIONS },

  /* ─── G. admin ────────────────────────────────────────────── */
  { key: "vis", label: "Видимость отчёта", group: "admin", kind: "multiselect", field: "reportVisibilities", appliesTo: "all", nullPolicy: "exclude", visibility: "admin",
    options: [{ value: "private", label: "Приватный" }, { value: "link", label: "По ссылке" }, { value: "public", label: "Публичный" }] },
  { key: "warn", label: "Есть предупреждения парсера", group: "admin", kind: "boolean", field: "hasWarnings", appliesTo: "all", nullPolicy: "exclude", visibility: "admin" },
  { key: "stale", label: "Отчёт не обновлялся, дней", group: "admin", kind: "range", appliesTo: "all", nullPolicy: "exclude", visibility: "admin", unit: "days",
    get: (r, ctx) => {
      const d = daysSince(r.reportsUpdatedAt, ctx.now);
      return d === null ? null : Math.floor(d);
    } },

  /* ─── quick views (shown as buttons, not in the panel) ────── */
  { key: "attention", label: "Требуют внимания", group: "presets", kind: "boolean", appliesTo: "all", nullPolicy: "exclude",
    help: "Проведён, и оценка ниже медианы своего типа, или слабая зона ниже порога, или низкий отклик.",
    get: (r, ctx) => {
      if (!COMPLETED.has(r.status)) return false;
      const s = ctx.settings;
      const typeVals = ctx.relative.relscore?.byType.get(r.typeKey);
      const belowMedian = r.orgScore10 !== null && typeVals ? r.orgScore10 < median(typeVals) : false;
      const weakZone = r.weakestZoneScore10 !== null && r.weakestZoneScore10 < s.attentionZone10;
      const lowResponse = r.responseRate !== null && r.responseRate < s.attentionResponseRate;
      return belowMedian || weakZone || lowResponse;
    } },
  { key: "best", label: "Лучшие", group: "presets", kind: "boolean", appliesTo: "all", nullPolicy: "exclude",
    help: "Топ-25% по оценке или NPS среди завершённых проектов с достаточной выборкой.",
    get: (r, ctx) => {
      if (!COMPLETED.has(r.status) || !enoughSample(r, ctx.settings)) return false;
      const inTop = (key: "relscore" | "relnps", v: number | null) => {
        const all = ctx.relative[key]?.all ?? [];
        return v !== null && all.length >= ctx.settings.relativeMinProjects && v >= quantile(all, 0.75);
      };
      return inTop("relscore", r.orgScore10) || inTop("relnps", r.nps);
    } },
  { key: "nofb", label: "Нет фидбэка", group: "presets", kind: "boolean", appliesTo: "all", nullPolicy: "exclude",
    help: "Проведён больше недели назад, отчёт по регистрации есть, по фидбэку — нет.",
    get: (r, ctx) => {
      const held = daysSince(r.endDate ?? r.startDate, ctx.now);
      return COMPLETED.has(r.status) && held !== null && held > ctx.settings.noFeedbackDays && r.hasRegistrationReport && !r.hasFeedbackReport;
    } },
];

export const FILTER_BY_KEY = new Map(FILTERS.map((f) => [f.key, f]));

export const GROUP_LABEL: Record<FilterGroup, string> = {
  main: "Основные",
  context: "Контекст проекта",
  scale: "Масштаб",
  results: "Результаты (фидбэк)",
  acquisition: "Привлечение и аудитория",
  relative: "Относительно других",
  admin: "Служебные",
  presets: "Быстрые виды",
};

/** Quick views: one click = a ready query string. */
export const PRESETS: { key: string; label: string; query: string }[] = [
  { key: "all", label: "Все", query: "" },
  { key: "attention", label: "Требуют внимания", query: "attention=1" },
  { key: "best", label: "Лучшие", query: "best=1" },
  { key: "nofb", label: "Нет фидбэка", query: "nofb=1" },
  { key: "onechannel", label: "Зависят от одного канала", query: "conc=high" },
];

export const SORTS: { key: string; label: string; field?: keyof ProjectRow; score?: boolean }[] = [
  { key: "date", label: "Дата проведения", field: "startDate" },
  { key: "score", label: "Оценка", field: "orgScore10", score: true },
  { key: "nps", label: "NPS", field: "nps", score: true },
  { key: "regs", label: "Регистрации", field: "registrants" },
  { key: "rr", label: "Отклик", field: "responseRate" },
  { key: "name", label: "Название", field: "name" },
];

export function median(sorted: number[]): number {
  return quantile(sorted, 0.5);
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Can this viewer see / use this filter? */
export const filterVisibleTo = (f: FilterDef, admin: boolean) => (f.visibility ?? "public") === "public" || admin;

export const appliesToTypes = (f: FilterDef, types: string[]) =>
  f.appliesTo === "all" || types.length === 0 || types.some((t) => (f.appliesTo as string[]).includes(t));
