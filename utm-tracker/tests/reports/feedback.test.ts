import { beforeAll, describe, expect, it } from "vitest";
import type { ReportDocument } from "@/lib/reports/types";
import { FEEDBACK_FILE, cell, parseFile, section, sheet } from "./helpers";

let doc: ReportDocument;
beforeAll(async () => {
  doc = await parseFile(FEEDBACK_FILE);
});

describe("Feedback Form Analysis", () => {
  it("is detected as feedback, with meta from the header", () => {
    expect(doc.type).toBe("feedback");
    expect(doc.title).toBe("ÖZGE Forum S'26 — Feedback Form Analytics");
    expect(doc.meta).toEqual({ eventName: "ÖZGE Forum S'26", period: "22 Aug – 9 Sep", sampleSize: 30 });
    expect(doc.warnings).toEqual([]);
    expect(doc.sheets.map((s) => s.key)).toEqual(["overview", "themes", "scorecard", "segments", "patterns", "methodology"]);
  });

  it("reads the core KPI cards", () => {
    const core = section(doc, "overview", /CORE EVENT METRICS/, "kpiGroup");
    const byLabel = Object.fromEntries(core.cards.map((c) => [c.label, c]));
    expect(byLabel["AVG ORGANIZATION"].value).toBeCloseTo(9.47, 2);
    expect(byLabel["ORGANIZATION NPS"].value).toBeCloseTo(86.67, 1); // shown as +87
    expect(byLabel["ORGANIZATION NPS"].format).toMatchObject({ kind: "number", decimals: 0, signed: true });
    expect(byLabel["ORGANIZATION NPS"].subtext).toBe("27 promoters / 1 detractors");
    expect(byLabel["TOTAL RESPONSES"].value).toBe(30);
    const ops = section(doc, "overview", /OPERATIONAL SCORES/, "kpiGroup");
    expect(ops.cards.find((c) => c.label === "NETWORKING QUALITY")?.tone).toBe("warn");
  });

  it("reads the score summary: 7 metrics, networking is the weakest", () => {
    const t = section(doc, "overview", /SCORE SUMMARY/, "table");
    expect(t.rows).toHaveLength(7);
    expect(cell(t, "Networking quality", /^Mean$/)).toBeCloseTo(4.43, 2);
    expect(cell(t, "Networking quality", /Score \/10/)).toBeCloseTo(8.87, 2);
    const scores = t.rows.map((r) => r[t.columns.findIndex((c) => /Score \/10/.test(c.label))] as number);
    expect(Math.min(...scores)).toBe(cell(t, "Networking quality", /Score \/10/));
    expect(t.columns.find((c) => /Top-box/.test(c.label))?.format.kind).toBe("percent");
    expect(t.note).toMatch(/^\* Organization NPS/);
  });

  it("reads the open-answer themes with verbatim quotes", () => {
    const liked = section(doc, "themes", /WHAT THEY LIKED/, "table");
    const pain = section(doc, "themes", /PAIN POINTS/, "table");
    const req = section(doc, "themes", /REQUESTS/, "table");
    expect([liked.rows.length, pain.rows.length, req.rows.length]).toEqual([6, 8, 7]);
    expect(cell(liked, 1, /Theme/)).toBe("Speakers & content");
    const [rank, theme, mentions, share, quote] = liked.rows[0];
    expect([rank, theme, mentions, quote]).toEqual([1, "Speakers & content", 17, "Много опытных и крутых спикеров, каждый говорит про реальные кейсы"]);
    expect(share).toBeCloseTo(0.567, 3);
    expect(liked.views[0]).toEqual({ type: "ranked", label: 1, value: 2, share: 3, quote: 4 });
    expect(liked.columns.map((c) => c.label)).not.toContain("Bar"); // decorative glyph column dropped
  });

  it("reads 5 segment tables, n = 0 segments as null (not 0)", () => {
    const segs = sheet(doc, "segments").sections.filter((s) => s.kind === "table");
    expect(segs).toHaveLength(5);
    const ch = section(doc, "segments", /CHANNEL GROUP/, "table");
    for (const name of ["Offline", "Direct / Other"]) {
      const row = ch.rows.find((r) => r[0] === name)!;
      expect(row[1]).toBe(0);
      expect(row.slice(2).every((v) => v === null)).toBe(true);
    }
    expect(ch.rows[ch.totalRow!][0]).toBe("All respondents");
  });

  it("reads outliers without names", () => {
    const t = section(doc, "patterns", /OUTLIER/, "table");
    expect(t.rows).toHaveLength(6);
    expect(t.rows.map((r) => r[0])).toEqual([1, 2, 3, 4, 5, 6].map((i) => `Respondent ${i}`));
    expect(JSON.stringify(doc)).not.toMatch(/Test Person/);
  });

  it("splits '22 (73%) ███' cells into count and share", () => {
    const t = section(doc, "patterns", /FREQUENCY/, "table");
    expect(cell(t, 10, /^Overall organization$/)).toBe(22);
    expect(cell(t, 10, /^Overall organization %$/)).toBeCloseTo(0.73, 2);
  });

  it("reads 8 key patterns and the methodology caveats", () => {
    expect(section(doc, "patterns", /KEY PATTERNS/, "callouts").items).toHaveLength(8);
    const caveats = doc.methodology.find((m) => /CAVEATS/.test(m.title))!;
    expect(caveats.items.map((i) => i.term)).toEqual(["Sample", "Ceiling effect"]);
  });

  it("does not open raw-data sheets", () => {
    expect(doc.skippedSheets.map((s) => s.name)).toEqual([
      "06 · Charts", "07 · Cleaned Data", "08 · Theme Coding", "09 · Raw Data", "10 · Reg Lookup",
    ]);
  });
});
