import { beforeAll, describe, expect, it } from "vitest";
import type { ReportDocument } from "@/lib/reports/types";
import { REGISTRATION_FILE, cell, parseFile, section } from "./helpers";

let doc: ReportDocument;
beforeAll(async () => {
  doc = await parseFile(REGISTRATION_FILE);
});

describe("Registration Form Analysis", () => {
  it("is detected as registration, with meta from the header", () => {
    expect(doc.type).toBe("registration");
    expect(doc.meta).toEqual({ eventName: "Özge S'26", period: "10 Aug – 28 Aug", sampleSize: 603 });
    expect(doc.warnings).toEqual([]);
    expect(doc.sheets.map((s) => s.key)).toEqual(["overview", "trend", "channels", "audience", "patterns", "tables", "methodology"]);
  });

  it("reads the headline KPIs", () => {
    const k = section(doc, "overview", /HEADLINE/, "kpiGroup");
    const v = Object.fromEntries(k.cards.map((c) => [c.label, c.value]));
    expect(k.cards).toHaveLength(12);
    expect(v["UNIQUE REGISTRANTS"]).toBe(603);
    expect(v["FORM SUBMISSIONS"]).toBe(629);
    expect(v["CAMPAIGN DAYS"]).toBe(19);
    expect(v["ACTIVE CHANNELS"]).toBe(14);
    expect(v["PEAK DAY REGS"]).toBe(146);
    expect(k.cards.find((c) => c.label === "PEAK DAY REGS")?.subtext).toMatch(/^21 Aug/);
  });

  it("reads channel head-to-head: 14 channels in 6 groups + All", () => {
    const t = section(doc, "overview", /HEAD-TO-HEAD/, "table");
    expect(t.rows).toHaveLength(15);
    expect(t.rows[t.totalRow!][0]).toBe("All channels");
    const groups = new Set(t.rows.filter((_, i) => i !== t.totalRow).map((r) => r[1]));
    expect(groups.size).toBe(6);
    expect(cell(t, "TG Mailing #1", /^Regs$/)).toBe(180);
    expect(cell(t, "TG Mailing #1", /^Share$/)).toBeCloseTo(0.2985, 4);
  });

  it("reads the day-by-day table with flags, weekday and hour profiles", () => {
    const d = section(doc, "trend", /DAY-BY-DAY/, "table");
    expect(d.rows).toHaveLength(19);
    const flags = d.rows.map((r) => r[d.columns.length - 1]).filter(Boolean);
    expect(flags.filter((f) => /spike/.test(String(f)))).toHaveLength(1);
    expect(flags.filter((f) => /zero/.test(String(f)))).toHaveLength(4);
    expect(cell(d, "2026-08-21", /^Total$/)).toBe(146);
    expect(d.columns.map((c) => c.label)).toEqual(expect.arrayContaining(["Telegram", "Instagram", "Email", "Offline", "Partners", "Direct / Other"]));
    expect(section(doc, "trend", /WEEKDAY/, "table").rows).toHaveLength(7);
    expect(section(doc, "trend", /HOUR/, "table").rows).toHaveLength(24);
  });

  it("reads the channel × day heatmap (14 × 19 + totals)", () => {
    const h = section(doc, "patterns", /HEATMAP/, "table");
    const days = h.columns.filter((c) => /^\d{1,2} [A-Z][a-z]{2}$/.test(c.label));
    expect(days).toHaveLength(19);
    expect(h.rows.filter((_, i) => i !== h.totalRow)).toHaveLength(14);
  });

  it("reads 6 audience rankings; past projects have no cumulative share", () => {
    const tables = doc.sheets.find((s) => s.key === "audience")!.sections.filter((s) => s.kind === "table");
    expect(tables).toHaveLength(6);
    const past = section(doc, "audience", /PAST AIESEC/, "table");
    const cum = past.columns.findIndex((c) => /Cumul/.test(c.label));
    expect(past.rows.every((r) => r[cum] === null)).toBe(true);
  });

  it("reads concentration for 4 dimensions with their status", () => {
    const c = section(doc, "patterns", /CONCENTRATION/, "table");
    expect(c.rows.map((r) => [r[0], r[r.length - 1]])).toEqual([
      ["Channels", "Moderate"], ["Channel groups", "High"], ["Universities", "High"], ["Majors", "Low"],
    ]);
  });

  it("does not open raw-data sheets", () => {
    expect(doc.skippedSheets.map((s) => s.name)).toEqual(["07 Cleaned Data", "08 Raw Data", "08b Raw Sheet2", "09 Channel Map"]);
    expect(doc.skippedSheets.find((s) => s.name === "07 Cleaned Data")?.rows).toBe(604); // header + 603
  });
});
