import type { CellValue, Column, ValueFormat } from "@/lib/reports/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format a value the way the workbook displayed it (decimals, %, sign, unit). */
export function formatValue(v: CellValue, f: ValueFormat): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") {
    if (f.kind === "date" && /^\d{4}-\d{2}-\d{2}/.test(v)) return formatDate(v);
    return v;
  }
  if (f.kind === "percent") return `${fmtNum(v * 100, f.decimals ?? 0, f.signed)}%`;
  const d = f.decimals ?? (Number.isInteger(v) ? 0 : Math.abs(v) < 10 ? 2 : 1);
  return `${fmtNum(v, d, f.signed)}${f.unit ?? ""}`;
}

function fmtNum(n: number, decimals: number, signed?: boolean): string {
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const isZero = Number(s.replace(/,/g, "")) === 0;
  if (n < 0 && !isZero) return `−${s}`;
  return signed && !isZero ? `+${s}` : s;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return y && m && d ? `${d} ${MONTHS[m - 1]}` : iso;
}

export const isNumericCol = (c: Column) => c.format.kind === "number" || c.format.kind === "percent";

/** Plain-text value for CSV export (raw numbers, no thousands separators). */
export function csvValue(v: CellValue, f: ValueFormat): string {
  if (v === null) return "";
  if (typeof v === "number") return f.kind === "percent" ? String(+(v * 100).toFixed(4)) : String(v);
  const s = f.kind === "date" ? formatDate(v) : v;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Turn an ALL-CAPS workbook heading into a readable title, keeping acronyms. */
export function readableTitle(s: string): string {
  const letters = s.replace(/[^A-Za-zА-Яа-яЁё]/g, "");
  const upper = letters.replace(/[^A-ZА-ЯЁ]/g, "").length;
  // Mostly capitals ("PERFORMANCE GAP vs CAMPAIGN AVERAGE") counts as a shouted heading.
  if (!letters || upper / letters.length < 0.8) return s;
  const KEEP = new Set(["NU", "NPS", "KPI", "KPIS", "HHI", "UTM", "IQR", "AIESEC", "TG", "IG", "QR", "Q&A", "PR", "IT", "CS"]);
  return s
    .split(/(\s+)/)
    .map((w, i) => {
      if (/^\s+$/.test(w) || KEEP.has(w.replace(/[^A-Z&]/g, "")) || w !== w.toUpperCase()) return w === "KPIS" ? "KPIs" : w;
      const lower = w.toLowerCase();
      return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join("");
}
