import { readFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { parseReport } from "@/lib/reports/parse";
import type { ReportDocument, Section, TableSection } from "@/lib/reports/types";

export const FIXTURES = path.resolve(__dirname, "../../fixtures/reports");
export const FEEDBACK_FILE = path.join(FIXTURES, "OZGE_Forum_Feedback_Form_Analysis.xlsx");
export const REGISTRATION_FILE = path.join(FIXTURES, "Ozge_S26_Reg_Form_Analysis.xlsx");

export const load = (file: string) => readFileSync(file);
export const parseFile = (file: string) => parseReport(load(file));

export function sheet(doc: ReportDocument, key: string) {
  const s = doc.sheets.find((x) => x.key === key);
  if (!s) throw new Error(`no sheet ${key}`);
  return s;
}

export function section<K extends Section["kind"]>(doc: ReportDocument, key: string, title: RegExp, kind?: K, nth = 0) {
  const all = sheet(doc, key).sections.filter((x) => title.test(x.title) && (!kind || x.kind === kind));
  const s = all[nth];
  if (!s) throw new Error(`no section ${title} in ${key}`);
  return s as Extract<Section, { kind: K }>;
}

export function cell(t: TableSection, rowLabel: string | number | RegExp, colLabel: RegExp) {
  const r = t.rows.find((row) => (rowLabel instanceof RegExp ? rowLabel.test(String(row[0])) : row[0] === rowLabel));
  const c = t.columns.findIndex((x) => colLabel.test(x.label));
  if (!r || c < 0) throw new Error(`no cell ${rowLabel} / ${colLabel} in ${t.title}`);
  return r[c];
}

/** A tiny workbook with the given sheets (name → <sheetData> inner XML). */
export async function makeXlsx(sheets: Record<string, string>, extra: Record<string, string> = {}): Promise<Buffer> {
  const zip = new JSZip();
  const names = Object.keys(sheets);
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`,
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
      .map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("")}</sheets></workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join("")}</Relationships>`,
  );
  names.forEach((n, i) =>
    zip.file(
      `xl/worksheets/sheet${i + 1}.xml`,
      `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheets[n]}</sheetData></worksheet>`,
    ),
  );
  for (const [p, content] of Object.entries(extra)) zip.file(p, content);
  return zip.generateAsync({ type: "nodebuffer" });
}
