import { describe, expect, it } from "vitest";
import { FEEDBACK_FILE, REGISTRATION_FILE, parseFile } from "./helpers";

// Golden snapshots of the full document. After an intended parser change,
// review the diff and update with: npx vitest run -u
describe("golden snapshots", () => {
  it("feedback", async () => {
    await expect(JSON.stringify(await parseFile(FEEDBACK_FILE), null, 2)).toMatchFileSnapshot("__snapshots__/feedback.json");
  });
  it("registration", async () => {
    await expect(JSON.stringify(await parseFile(REGISTRATION_FILE), null, 2)).toMatchFileSnapshot("__snapshots__/registration.json");
  });
});
