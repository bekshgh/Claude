import { describe, expect, it } from "vitest";
import { runQuery } from "@/lib/projects/filters/engine";
import { FILTERS, PRESETS } from "@/lib/projects/filters/registry";
import { emptyState, parseState, toQuery, type FilterState } from "@/lib/projects/filters/state";
import type { ProjectRow } from "@/lib/projects/rows";
import { seasonOf } from "@/lib/projects/rows";
import { DEFAULT_SETTINGS } from "@/lib/projects/settings";

const NOW = new Date("2026-10-10T00:00:00Z");

function row(id: string, o: Partial<ProjectRow> = {}): ProjectRow {
  const startDate = o.startDate ?? "2026-05-10";
  const base: ProjectRow = {
    id, slug: id, name: id, typeKey: "forum", typeName: "Форум", format: "offline", status: "done",
    startDate, endDate: startDate, city: "Astana", venue: null, ownerTeam: "AIESEC NU", tags: [], demo: true,
    reportsUpdatedAt: "2026-06-01T00:00:00Z", season: seasonOf(new Date(startDate)), hasMetrics: true,
    registrants: null, submissions: null, campaignDays: null, channelCount: null, responses: null, responseRate: null,
    orgScore10: null, nps: null, composite10: null, weakestZone: null, weakestZoneScore10: null, strongestZone: null,
    strongestZoneScore10: null, topPraiseTheme: null, topPainTheme: null, topChannelGroup: null, topChannelShare: null,
    topChannel: null, topChannelOwnShare: null, hhiGroups: null, concentrationLevel: null, peakDayShare: null,
    isBursty: null, topUniversityName: null, topUniversityShare: null, newToOrgShare: null, internshipShare: null,
    avgAge: null, duplicateRate: null, audienceStage: null, ageBand: null, hasRegistrationReport: false,
    hasFeedbackReport: false, hasWarnings: false, reportVisibilities: [],
  };
  const r = { ...base, ...o };
  if (o.startDate) r.season = seasonOf(new Date(o.startDate));
  return r;
}

/** registration + feedback metrics in one go */
const full = (regs: number, resp: number, score: number, extra: Partial<ProjectRow> = {}): Partial<ProjectRow> => ({
  registrants: regs, responses: resp, responseRate: resp / regs, orgScore10: score, nps: (score - 8) * 50,
  hasRegistrationReport: true, hasFeedbackReport: true, weakestZone: "networking", weakestZoneScore10: score - 0.6,
  concentrationLevel: "moderate", reportVisibilities: ["link"], ...extra,
});

const ROWS: ProjectRow[] = [
  row("ozge", { name: "ÖZGE Forum S'26", startDate: "2026-08-22", tags: ["Career"], ...full(603, 30, 9.47, { concentrationLevel: "high", weakestZoneScore10: 8.87 }) }),
  row("f1", { name: "Leaders Forum", ...full(250, 40, 9.1) }),
  row("f2", { name: "Impact Forum", city: "Almaty", ...full(120, 20, 8.6, { weakestZoneScore10: 8.1 }) }),
  row("f3", { name: "Career Forum", ...full(900, 60, 9.6, { weakestZone: "food" }) }),
  row("f4", { name: "Youth Forum", startDate: "2025-11-20", ...full(80, 8, 9.9) }), // small sample
  row("c1", { name: "Business Case Cup", typeKey: "case_championship", typeName: "Кейс-чемпионат", tags: ["Business"], ...full(300, 45, 9.0) }),
  row("c2", { name: "Finance Case", typeKey: "case_championship", typeName: "Кейс-чемпионат", startDate: "2026-08-30",
    registrants: 210, hasRegistrationReport: true, concentrationLevel: "low", reportVisibilities: ["private"] }), // no feedback yet
  row("h1", { name: "AI Hackathon", typeKey: "hackathon", typeName: "Хакатон", status: "planned", startDate: "2026-11-15", hasMetrics: false }),
];

const opts = { settings: DEFAULT_SETTINGS, now: NOW, admin: true };
const q = (query: string, rows = ROWS) => runQuery(rows, parseState(new URLSearchParams(query)), opts);
const ids = (query: string) => q(query).items.map((r) => r.id).sort();

describe("registry → query, one test per filter kind", () => {
  it("search: case, ё/е and diacritics insensitive, cyrillic and latin", () => {
    expect(ids("q=ozge")).toEqual(["ozge"]);
    expect(ids("q=озге")).toEqual(["ozge"]); // transliterated
    expect(ids("q=ÖZGE%20форум")).toEqual(["ozge"]);
    expect(ids("q=форум")).toEqual(["f1", "f2", "f3", "f4", "ozge"]); // type name
    expect(ids("q=business")).toEqual(["c1"]); // tag
    expect(ids("q=almaty")).toEqual(["f2"]);
  });
  it("multiselect: OR inside a filter, AND between filters", () => {
    expect(ids("type=case_championship,hackathon")).toEqual(["c1", "c2", "h1"]);
    expect(ids("type=forum&city=Almaty")).toEqual(["f2"]);
  });
  it("tags", () => expect(ids("tags=Career,Business")).toEqual(["c1", "ozge"]));
  it("range in shown units (shares in %)", () => {
    expect(ids("regs=300..")).toEqual(["c1", "f3", "ozge"]);
    expect(ids("score10=9..9.5")).toEqual(["c1", "f1", "ozge"]);
    expect(ids("rr=10..")).toEqual(["c1", "f1", "f2", "f4"]); // ≥ 10%
  });
  // n ≥ 30 and ≥ 5%: ÖZGE has 30 answers from 603 registrants = 4.98%, just under the default threshold.
  it("boolean", () => expect(ids("enough=1")).toEqual(["c1", "f1", "f3"]));
  it("date range presets and custom", () => {
    expect(ids("date=season")).toEqual(["h1"]); // autumn 2026 (the start of h1)
    expect(ids("date=lastyear")).toEqual(["f4"]);
    expect(ids("date=2026-08-01..2026-08-31")).toEqual(["c2", "ozge"]);
    expect(ids("season=2026-summer")).toEqual(["c2", "ozge"]);
  });
  it("data state", () => {
    expect(ids("data=none")).toEqual(["h1"]);
    expect(ids("data=reg&status=done")).not.toContain("h1");
    expect(ids("data=both")).toHaveLength(6);
  });
});

describe("facet counts", () => {
  it("each option's count equals the result of selecting it (with the other filters on)", () => {
    const base = "status=done,archived&regs=100..";
    const res = q(base);
    for (const f of FILTERS.filter((x) => ["multiselect", "tags", "relative"].includes(x.kind) && x.key !== "status")) {
      for (const opt of res.facets[f.key] ?? []) {
        if (opt.disabled) continue;
        expect(q(`${base}&${f.key}=${encodeURIComponent(opt.value)}`).matched, `${f.key}=${opt.value}`).toBe(opt.count);
      }
    }
  });
  it("counts ignore the filter's own selection, zero options stay listed", () => {
    const res = q("type=forum");
    const type = Object.fromEntries(res.facets.type.map((o) => [o.value, o.count]));
    expect(type).toMatchObject({ forum: 5, case_championship: 2, hackathon: 1 });
    expect(res.facets.weak.find((o) => o.value === "timing")?.count).toBe(0);
  });
});

describe("missing data", () => {
  it("numeric filters never match projects without a value, and say how many were hidden", () => {
    const res = q("score10=0..10");
    expect(res.matched).toBe(6);
    expect(res.hiddenNoData).toBe(2); // c2 (no feedback), h1 (no reports)
    expect(res.hiddenBy).toEqual({ score10: 2 });
    expect(q("score10=0..10&nulls=1").matched).toBe(8);
  });
  it("a project that fails a filter on a value is not counted as 'no data'", () => {
    const res = q("score10=9.5..&city=Almaty");
    expect(res.matched).toBe(0);
    expect(res.hiddenNoData).toBe(0);
  });
  it("sorting puts missing values last and small samples after the rest for scores", () => {
    const order = runQuery(ROWS, parseState(new URLSearchParams("sort=-score")), opts).items.map((r) => r.id);
    expect(order.slice(0, 5)).toEqual(["f3", "ozge", "f1", "c1", "f2"]);
    expect(order[5]).toBe("f4"); // 9.9 but n = 8
    expect(order.slice(6).sort()).toEqual(["c2", "h1"]);
  });
  it("nothing found → hints which filter to drop", () => {
    const res = q("type=hackathon&regs=100..");
    expect(res.matched).toBe(0);
    expect(res.emptyHints[0]).toMatchObject({ key: "type" });
    expect(res.emptyHints.find((h) => h.key === "regs")?.gain).toBe(1);
  });
});

describe("URL state", () => {
  it("round-trips without loss", () => {
    const query = "q=forum&type=forum,hackathon&date=2026-01-01..2026-06-30&season=2026-autumn&status=done&regs=100..600&score10=9..10&enough=1&relscore=top25&sort=score&nulls=1&view=table&cmp=f1,f2";
    const s1 = parseState(new URLSearchParams(query));
    const s2 = parseState(new URLSearchParams(toQuery(s1)));
    expect(s2).toEqual(s1);
    expect(toQuery(s2)).toBe(toQuery(s1));
  });
  it("drops junk instead of failing", () => {
    const s = parseState(new URLSearchParams("type=forum,<script>&regs=abc&score10=10..1&status=nope&sort=-hack&enough=maybe&foo=1&cmp=../x,f1&date=yesterday"));
    expect(s.values).toEqual({ type: ["forum"] });
    expect(s.sort).toEqual({ key: "date", dir: -1 });
    expect(s.cmp).toEqual(["f1"]);
  });
});

describe("relative filters", () => {
  it("compare with the median of the project's own type", () => {
    // forums with n ≥ 10: ozge 9.47, f1 9.1, f2 8.6, f3 9.6 → median 9.285
    expect(ids("relscore=above_type_median")).toEqual(["f3", "ozge"]);
  });
  it("are disabled when the type has fewer than 4 comparable projects", () => {
    const res = q("type=case_championship");
    expect(res.facets.relscore.find((o) => o.value === "above_type_median")?.disabled).toMatch(/недостаточно/);
    expect(q("type=forum").facets.relscore.find((o) => o.value === "above_type_median")?.disabled).toBeUndefined();
  });
});

describe("quick views", () => {
  const preset = (key: string) => q(PRESETS.find((p) => p.key === key)!.query).items.map((r) => r.id).sort();
  it("needs attention: below type median, weak zone < 8.5 or response rate < 5%", () => {
    // f1 9.1 < forum median; f2 weak zone 8.1; c1 weak zone 8.4; ÖZGE response rate 4.98% < 5%
    expect(preset("attention")).toEqual(["c1", "f1", "f2", "ozge"]);
  });
  it("best: top 25% by score or NPS among completed projects with enough answers", () => expect(preset("best")).toEqual(["f3"]));
  it("no feedback: held over a week ago, registration report only", () => expect(preset("nofb")).toEqual(["c2"]));
  it("depends on one channel", () => expect(preset("onechannel")).toEqual(["ozge"]));
});

describe("access", () => {
  it("admin-only filters are not accepted for non-admins", () => {
    expect(parseState(new URLSearchParams("vis=private&warn=1"), false).values).toEqual({});
    expect(parseState(new URLSearchParams("vis=private"), true).values).toEqual({ vis: ["private"] });
  });
  it("non-admins only see (and count) public projects", () => {
    const rows = [...ROWS, row("pub", { reportVisibilities: ["public"], registrants: 50 })];
    const res = runQuery(rows, emptyState(), { ...opts, admin: false });
    expect(res.items.map((r) => r.id)).toEqual(["pub"]);
    expect(res.facets.type.reduce((a, o) => a + o.count, 0)).toBe(1);
    expect(res.histograms.regs?.withValue).toBe(1);
    expect(res.facets.vis).toBeUndefined();
  });
});

describe("performance", () => {
  it("1000 projects with filters, facets and histograms in well under 300 ms", () => {
    const many = Array.from({ length: 1000 }, (_, i) => {
      const src = ROWS[i % ROWS.length];
      return { ...src, id: `p${i}`, slug: `p${i}`, registrants: src.registrants === null ? null : src.registrants + i };
    });
    const state: FilterState = parseState(new URLSearchParams("type=forum,case_championship&regs=100..&score10=8..&relscore=above_type_median&sort=-score"));
    runQuery(many, state, opts); // warm-up
    const t = performance.now();
    const res = runQuery(many, state, opts);
    const ms = performance.now() - t;
    expect(res.total).toBe(1000);
    expect(ms).toBeLessThan(300);
  });
});
