import type { CellValue, Tone, ValueFormat } from "./types";
import { serialToIso, type RawCell } from "./xlsx";

/**
 * Turning raw cells into display-ready values. The number format decides the
 * meaning (0.2985 with "0.0%" is a share), never the magnitude.
 */

const fmtCache = new Map<string, ValueFormat>();

export function classifyFormat(code: string): ValueFormat {
  const hit = fmtCache.get(code);
  if (hit) return hit;
  const f = computeFormat(code);
  fmtCache.set(code, f);
  return f;
}

function computeFormat(code: string): ValueFormat {
  if (!code || code === "General") return { kind: "number" };
  if (code === "@") return { kind: "text" };
  const first = code.split(";")[0];
  // Strip quoted literals and escapes before looking for tokens.
  const bare = first.replace(/"[^"]*"/g, "").replace(/\\./g, "").replace(/\[[^\]]*\]/g, "");
  const unitMatch = /"([^"]+)"\s*$/.exec(first);
  const unit = unitMatch ? unitMatch[1] : undefined;
  if (/%/.test(bare)) return { kind: "percent", decimals: decimalsOf(bare) };
  if (/[dmyhs]/i.test(bare) && !/[0#?]/.test(bare)) return { kind: "date" };
  return {
    kind: "number",
    decimals: decimalsOf(bare),
    ...(first.trim().startsWith("+") ? { signed: true } : {}),
    ...(unit ? { unit } : {}),
  };
}

function decimalsOf(bare: string): number {
  const m = /\.([0#?]+)/.exec(bare);
  return m ? m[1].length : 0;
}

/** Decorative glyphs used to draw bars / dots inside cells. Bars are stripped
 * from any text; dots (●○) only make a cell decorative when it holds nothing
 * else, because "○ zero" style flags reuse them. */
const DECOR = /[█░▓▒■□]/g;
const DECOR_ONLY = /^[\s█░▓▒■□●○◉◯★☆]+$/;
const NULLISH = new Set(["", "–", "—", "-", "n/a", "N/A", "na", "·"]);

export function isDecorative(v: unknown): boolean {
  return typeof v === "string" && DECOR_ONLY.test(v);
}

export function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Display value for a cell: number, ISO date string, text, or null. */
export function cellValue(cell: RawCell | undefined, date1904 = false): CellValue {
  if (!cell || cell.v === null || cell.v === undefined) return null;
  if (typeof cell.v === "boolean") return cell.v ? "Yes" : "No";
  if (typeof cell.v === "number") {
    if (!Number.isFinite(cell.v)) return null;
    return classifyFormat(cell.fmt).kind === "date" ? serialToIso(cell.v, date1904) : cell.v;
  }
  const t = cleanText(cell.v.replace(DECOR, " "));
  if (NULLISH.has(t)) return null;
  if (/^#(N\/A|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|NULL!)$/.test(t)) return null;
  return t;
}

/** "22  (73%)  ███" → { count: 22, share: 0.73 } */
export function parseCountShare(s: string): { count: number; share: number } | null {
  const m = /^(-?\d+(?:\.\d+)?)\s*\((\d+(?:\.\d+)?)%\)\s*$/.exec(cleanText(s.replace(DECOR, " ")));
  return m ? { count: Number(m[1]), share: Number(m[2]) / 100 } : null;
}

/** Leading signal glyph → tone; returns the text without the glyph. */
export function splitSignal(s: string): { text: string; tone: Tone; glyph?: string } {
  const m = /^\s*([▶▸►•✓✔⚠❗▲▼○✗✘])\s*/.exec(s);
  const glyph = m?.[1];
  const text = cleanText(m ? s.slice(m[0].length) : s);
  let tone: Tone = "neutral";
  if (glyph === "⚠" || glyph === "❗" || /\b(lowest|weakest|worst)\b/i.test(text)) tone = "warn";
  else if (glyph === "✓" || glyph === "✔") tone = "good";
  else if (glyph === "✗" || glyph === "✘") tone = "critical";
  return { text, tone, glyph };
}
