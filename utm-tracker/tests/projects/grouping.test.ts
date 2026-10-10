import { describe, expect, it } from "vitest";
import { eventKey, summarize } from "@/lib/projects/grouping";
import { FEEDBACK_FILE, REGISTRATION_FILE, parseFile } from "../reports/helpers";

describe("bulk upload grouping", () => {
  it("puts the feedback and registration reports of one event together", async () => {
    const [fb, reg] = await Promise.all([parseFile(FEEDBACK_FILE), parseFile(REGISTRATION_FILE)]);
    const a = summarize(fb);
    const b = summarize(reg);
    expect(a.eventName).toBe("ÖZGE Forum S'26");
    expect(b.eventName).toBe("Özge S'26");
    expect(a.eventKey).toBe("ozge s26");
    expect(b.eventKey).toBe(a.eventKey);
  });

  it("reads the event date from dated rows in the file", async () => {
    const [fb, reg] = await Promise.all([parseFile(FEEDBACK_FILE), parseFile(REGISTRATION_FILE)]);
    expect(summarize(fb).eventDate).toBe("2026-08-22"); // first feedback responses (event day)
    expect(summarize(reg).eventDate).toBe("2026-08-28"); // end of the registration campaign
  });

  it("keeps different events apart", () => {
    expect(eventKey("Leaders Forum '26")).not.toBe(eventKey("Leaders Forum '25"));
    expect(eventKey("Business Case Cup — Registration Form Analysis")).toBe(eventKey("Business Case Cup"));
    expect(eventKey("")).toBe("");
  });
});
