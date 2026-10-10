import type { ReportDocument, Section } from "./types";

/**
 * Personal data never leaves the parser:
 *  - raw-data sheets are not read at all (see configs: only listed sheets are parsed);
 *  - in analytics tables, a person's name column becomes "Респондент N";
 *  - columns whose values are contacts (emails, phones, @handles) are dropped —
 *    judged by the values, since "Email" / "Telegram" are also channel names;
 *  - emails and phone numbers inside any text are masked.
 */

const NAME_COL = /^(name|full name|respondent|имя|фио|аты-жөні)$/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// 10–12 digits, optionally +, spaces, brackets and dashes; not an ISO date.
const PHONE = /(?<![\w-])\+?\d[\d\s()-]{8,16}\d(?![\w-])/g;

const HANDLE = /^@[A-Za-z0-9_.]{3,}$/;

function looksLikeContacts(values: unknown[]): boolean {
  const strs = values.filter((v): v is string => typeof v === "string" && v.trim() !== "");
  if (strs.length === 0) return false;
  const hits = strs.filter((v) => {
    const t = v.trim();
    return new RegExp(`^${EMAIL.source}$`).test(t) || HANDLE.test(t) || maskText(t) !== t;
  });
  return hits.length / strs.length >= 0.5;
}

export function maskText(s: string): string {
  return s
    .replace(EMAIL, "[email скрыт]")
    .replace(PHONE, (m) => {
      const digits = m.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 12 || /^\d{4}-\d{2}-\d{2}/.test(m)) return m;
      return "[телефон скрыт]";
    });
}

function sanitizeSection(s: Section): Section {
  if (s.kind !== "table") return s;
  const drop = new Set<number>();
  const nameCols: number[] = [];
  s.columns.forEach((c, i) => {
    if (NAME_COL.test(c.label.trim())) nameCols.push(i);
    else if (looksLikeContacts(s.rows.map((r) => r[i]))) drop.add(i);
  });
  const keep = (i: number) => !drop.has(i);
  const rows = s.rows.map((r, ri) =>
    r.map((v, ci) => (nameCols.includes(ci) && v !== null ? `Респондент ${ri + 1}` : v)).filter((_, ci) => keep(ci)),
  );
  // Column indexes in view hints shift when columns are dropped.
  const remap = (i: number) => i - [...drop].filter((d) => d < i).length;
  return {
    ...s,
    columns: s.columns.map((c, i) => (nameCols.includes(i) ? { ...c, label: "Респондент" } : c)).filter((_, i) => keep(i)),
    rows,
    views: drop.size ? s.views.map((v) => remapView(v, remap)) : s.views,
  };
}

function remapView<T extends object>(v: T, remap: (i: number) => number): T {
  const out = { ...v } as Record<string, unknown>;
  for (const [k, val] of Object.entries(out)) {
    if (k === "type") continue;
    if (typeof val === "number") out[k] = remap(val);
    else if (Array.isArray(val)) out[k] = val.map((x) => (typeof x === "number" ? remap(x) : x));
  }
  return out as T;
}

/** Deep-mask every string in the document. */
function maskDeep<T>(v: T): T {
  if (typeof v === "string") return maskText(v) as T;
  if (Array.isArray(v)) return v.map(maskDeep) as T;
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) o[k] = maskDeep(x);
    return o as T;
  }
  return v;
}

export function sanitizeDocument(doc: ReportDocument): ReportDocument {
  const sheets = doc.sheets.map((sh) => ({ ...sh, sections: sh.sections.map(sanitizeSection) }));
  return maskDeep({ ...doc, sheets });
}
