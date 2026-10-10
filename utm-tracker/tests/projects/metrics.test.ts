import { beforeAll, describe, expect, it } from "vitest";
import { computeMetrics, themeLabels, type ComputedMetrics } from "@/lib/projects/metrics";
import { suggestTheme, zoneOf } from "@/lib/projects/dictionaries";
import { parseFile, FEEDBACK_FILE, REGISTRATION_FILE } from "../reports/helpers";
import type { ReportDocument } from "@/lib/reports/types";

let reg: ReportDocument;
let fb: ReportDocument;
let m: ComputedMetrics;

beforeAll(async () => {
  [reg, fb] = await Promise.all([parseFile(REGISTRATION_FILE), parseFile(FEEDBACK_FILE)]);
  m = computeMetrics({ registration: reg, feedback: fb, themes: (_k, raw) => suggestTheme(raw) });
});

describe("project metrics from the ÖZGE Forum S'26 reports", () => {
  it("scale", () => {
    expect(m).toMatchObject({ registrants: 603, submissions: 629, campaignDays: 19, channelCount: 14, responses: 30 });
    expect(m.responseRate).toBeCloseTo(30 / 603, 4); // ≈ 5%
  });

  it("results, normalised to /10", () => {
    expect(m.orgScore10).toBeCloseTo(9.47, 2);
    expect(m.nps).toBeCloseTo(86.7, 1); // +87
    expect(m.composite10).toBeCloseTo(9.3, 1);
    expect(m.weakestZone).toBe("networking");
    expect(m.weakestZoneScore10).toBeCloseTo(8.87, 2);
    expect(m.strongestZone).toBe("support");
    expect(m.strongestZoneScore10).toBeCloseTo(9.87, 2);
    expect(m.topPraiseTheme).toBe("speakers");
    expect(m.topPainTheme).toBe("networking");
  });

  it("acquisition & audience", () => {
    expect(m.topChannelGroup).toBe("telegram");
    expect(m.topChannelShare).toBeCloseTo(0.56, 2);
    expect(m.topChannel).toBe("TG Mailing #1");
    expect(m.topChannelOwnShare).toBeCloseTo(0.30, 2);
    expect(m.hhiGroups).toBeCloseTo(0.36, 2);
    expect(m.concentrationLevel).toBe("high");
    expect(m.peakDayShare).toBeCloseTo(0.24, 2);
    expect(m.isBursty).toBe(true);
    expect(m.topUniversityName).toBe("Nazarbayev University");
    expect(m.topUniversityShare).toBeCloseTo(0.51, 2);
    expect(m.newToOrgShare).toBeCloseTo(0.73, 2);
    expect(m.internshipShare).toBeCloseTo(0.83, 2);
    expect(m.avgAge).toBeCloseTo(20, 0);
    expect(m.duplicateRate).toBeCloseTo(0.041, 3);
    expect(m.audienceStage).toBe("y1_2");
    expect(m.ageBand).toBe("18–19");
  });

  it("missing reports give null, not 0", () => {
    const onlyFb = computeMetrics({ feedback: fb });
    expect(onlyFb.registrants).toBeNull();
    expect(onlyFb.topChannelGroup).toBeNull();
    expect(onlyFb.isBursty).toBeNull();
    expect(onlyFb.responseRate).toBeCloseTo(30 / 603, 4); // from "= 5% of 603 registrants"
    expect(onlyFb.topPraiseTheme).toBeNull(); // no theme mapping → not counted
    const onlyReg = computeMetrics({ registration: reg });
    expect(onlyReg.orgScore10).toBeNull();
    expect(onlyReg.weakestZone).toBeNull();
    expect(onlyReg.responses).toBeNull();
    expect(onlyReg.responseRate).toBeNull();
  });
});

describe("dictionaries", () => {
  it("maps the score rows to zones", () => {
    expect(["Overall organization", "Speaker sessions", "Coffee break", "Coffee-zone location", "Organizer support", "Telegram chat", "Networking quality"].map(zoneOf))
      .toEqual([null, "speakers", "food", "logistics", "support", "communication", "networking"]);
  });

  it("suggests canonical themes for the real open-answer themes", () => {
    const got = Object.fromEntries(themeLabels(fb).map((t) => [t.rawLabel, suggestTheme(t.rawLabel)]));
    expect(got).toMatchObject({
      "Speakers & content": "speakers",
      "Games & energizers (Monopoly, roll call, quiz, dance)": "interactive",
      "Friendly team & atmosphere": "team",
      "Coffee break & food (unprompted)": "food",
      "Gifts & prizes": "prizes",
      "Passive format / too little networking": "networking",
      "Schedule delays / speaker time cut": "timing",
      "Drinks (Basta lemonade) / no water": "food",
      "Telegram chat: spam, bot, not added": "communication",
      "Venue & logistics (space, queue, entry, Wi-Fi)": "logistics",
      "Late agenda & announcements": "timing",
      "Q&A too short / no access to speakers": "speakers",
      "Longer Q&A / more time with speakers": "speakers",
      "Structured networking time (1:1, groups)": "networking",
      "Water & drink options": "food",
      "More about AIESEC roles & internships": null,
    });
    expect(suggestTheme("Мало нетворкинга")).toBe("networking");
    expect(suggestTheme("Керемет кофе-брейк")).toBe("food");
  });
});
