// Build a test fixture from a real analysis workbook WITHOUT personal data:
//   npm run sanitize:fixture -- <in.xlsx> <out.xlsx>
//
// - only the analytics sheets the parser reads are kept, rewritten from their
//   cached values (formulas dropped, values, styles and merges kept);
// - raw-data sheets become empty sheets that only keep their size (<dimension>);
// - shared strings, document properties (author), drawings and charts are removed;
// - people's names in "Name" columns are replaced with fake ones, so the
//   privacy tests still have something to catch.
import { readFileSync, writeFileSync } from "node:fs";
import JSZip from "jszip";
import { CONFIGS, detectType, normalizeSheetName } from "../src/lib/reports/configs";
import { readWorkbook, numToCol, type Grid } from "../src/lib/reports/xlsx";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function fakeNames(grid: Grid) {
  for (const [k, cell] of grid.cells) {
    if (cell.v !== "Name") continue;
    const [r, c] = k.split(",").map(Number);
    for (let rr = r + 1, i = 1; ; rr++, i++) {
      const below = grid.cells.get(`${rr},${c}`);
      if (!below || typeof below.v !== "string" || !below.v.trim()) break;
      below.v = `Test Person ${String.fromCharCode(64 + i)}`;
    }
  }
}

function sheetXml(grid: Grid): string {
  const rows = new Map<number, string[]>();
  const keys = [...grid.cells.keys()]
    .map((k) => k.split(",").map(Number) as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [r, c] of keys) {
    const cell = grid.cells.get(`${r},${c}`)!;
    const ref = `${numToCol(c)}${r}`;
    let x: string;
    if (cell.v === null) x = `<c r="${ref}" s="${cell.s}"/>`;
    else if (typeof cell.v === "number") x = `<c r="${ref}" s="${cell.s}"><v>${cell.v}</v></c>`;
    else if (typeof cell.v === "boolean") x = `<c r="${ref}" s="${cell.s}" t="b"><v>${cell.v ? 1 : 0}</v></c>`;
    else x = `<c r="${ref}" s="${cell.s}" t="inlineStr"><is><t xml:space="preserve">${esc(cell.v)}</t></is></c>`;
    (rows.get(r) ?? rows.set(r, []).get(r)!).push(x);
  }
  const sheetData = [...rows].map(([r, cs]) => `<row r="${r}">${cs.join("")}</row>`).join("");
  const merges = grid.merges.length
    ? `<mergeCells count="${grid.merges.length}">${grid.merges
        .map((m) => `<mergeCell ref="${numToCol(m.c1)}${m.r1}:${numToCol(m.c2)}${m.r2}"/>`)
        .join("")}</mergeCells>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${numToCol(Math.max(grid.maxCol, 1))}${Math.max(grid.maxRow, 1)}"/><sheetData>${sheetData}</sheetData>${merges}</worksheet>`;
}

const emptySheetXml = (rows: number) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:A${Math.max(rows, 1)}"/><sheetData/></worksheet>`;

async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error("Usage: npm run sanitize:fixture -- <in.xlsx> <out.xlsx>");
  const buf = readFileSync(input);
  const src = await JSZip.loadAsync(buf);

  let type: ReturnType<typeof detectType> = null;
  const wb = await readWorkbook(buf, (name, all) => {
    type ??= detectType(all);
    if (!type) throw new Error("Unknown report type");
    return CONFIGS[type].sheets.some((s) => s.match.test(normalizeSheetName(name)));
  });

  // Map sheet name → part path, from the workbook + rels.
  const wbXml = await src.file("xl/workbook.xml")!.async("string");
  const relsXml = await src.file("xl/_rels/workbook.xml.rels")!.async("string");
  const rels = Object.fromEntries([...relsXml.matchAll(/<Relationship [^>]*?Id="([^"]+)"[^>]*?Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const relsAlt = Object.fromEntries([...relsXml.matchAll(/<Relationship [^>]*?Target="([^"]+)"[^>]*?Id="([^"]+)"/g)].map((m) => [m[2], m[1]]));
  const pathOf = (name: string) => {
    const m = new RegExp(`<sheet [^>]*name="${esc(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*r:id="([^"]+)"`).exec(wbXml);
    const target = m ? rels[m[1]] ?? relsAlt[m[1]] : undefined;
    if (!target) throw new Error(`No part for sheet ${name}`);
    return target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\.\//, "")}`;
  };

  const out = new JSZip();
  for (const grid of wb.grids) {
    fakeNames(grid);
    out.file(pathOf(grid.name), sheetXml(grid));
  }
  for (const s of wb.skipped) out.file(pathOf(s.name), emptySheetXml(s.rows));

  // Structural parts only. No sharedStrings (cells are inline), no docProps.
  for (const p of ["xl/workbook.xml", "xl/styles.xml", "_rels/.rels"]) {
    out.file(p, await src.file(p)!.async("string"));
  }
  for (const p of Object.keys(src.files).filter((p) => p.startsWith("xl/theme/"))) {
    out.file(p, await src.file(p)!.async("uint8array"));
  }
  out.file(
    "xl/_rels/workbook.xml.rels",
    relsXml.replace(/<Relationship [^>]*(sharedStrings|calcChain)[^>]*\/>/g, ""),
  );
  const ct = await src.file("[Content_Types].xml")!.async("string");
  out.file(
    "[Content_Types].xml",
    ct.replace(/<Override [^>]*PartName="([^"]+)"[^>]*\/>/g, (m, part: string) => (out.file(part.slice(1)) ? m : "")),
  );
  out.file("_rels/.rels", (await src.file("_rels/.rels")!.async("string")).replace(/<Relationship [^>]*docProps[^>]*\/>/g, ""));

  writeFileSync(output, await out.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log(`${output}: kept ${wb.grids.length} analytics sheets, emptied ${wb.skipped.length} data sheets`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
