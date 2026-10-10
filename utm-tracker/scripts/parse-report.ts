// Debug: print the parsed ReportDocument for an .xlsx file.
//   npm run parse:report -- path/to/file.xlsx [--type feedback|registration] [--summary]
import { readFileSync } from "node:fs";
import { parseReport } from "../src/lib/reports/parse";
import type { ReportType } from "../src/lib/reports/types";

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) throw new Error("Usage: npm run parse:report -- <file.xlsx> [--type feedback|registration] [--summary]");
  const ti = args.indexOf("--type");
  const type = ti >= 0 ? (args[ti + 1] as ReportType) : undefined;
  const doc = await parseReport(readFileSync(file), { type });
  if (!args.includes("--summary")) {
    console.log(JSON.stringify(doc, null, 2));
    return;
  }
  console.log(`${doc.type} · ${doc.title}\n${doc.subtitle ?? ""}\nmeta: ${JSON.stringify(doc.meta)}`);
  for (const sh of doc.sheets) {
    console.log(`\n[${sh.key}] ${sh.title}`);
    for (const s of sh.sections) {
      const size =
        s.kind === "table" ? `${s.rows.length}×${s.columns.length} ${s.views.map((v) => v.type).join("+")}${s.note ? " +note" : ""}`
        : s.kind === "kpiGroup" ? `${s.cards.length} cards`
        : `${s.items.length} items`;
      console.log(`  ${s.kind.padEnd(11)} ${s.title}  —  ${size}`);
    }
  }
  console.log(`\nskipped: ${doc.skippedSheets.map((s) => `${s.name} (${s.rows} rows)`).join(", ")}`);
  console.log(`warnings: ${doc.warnings.length ? "\n  " + doc.warnings.map((w) => `${w.sheet ?? ""} / ${w.section ?? ""}: ${w.message}`).join("\n  ") : "none"}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? `${e.name}: ${e.message}` : e);
  process.exit(1);
});
