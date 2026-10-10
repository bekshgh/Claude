import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { ReportView } from "@/components/reports/ReportView";
import { readableTitle } from "@/components/reports/format";
import { FEEDBACK_FILE, REGISTRATION_FILE, parseFile } from "./helpers";

describe.each([
  ["feedback", FEEDBACK_FILE],
  ["registration", REGISTRATION_FILE],
])("%s report page", (_name, file) => {
  it("renders every tab without errors, with each section heading", async () => {
    const doc = await parseFile(file);
    for (const sheet of doc.sheets) {
      const html = renderToString(<ReportView doc={doc} initialTab={sheet.key} />);
      expect(html).toContain(`aria-selected="true"`);
      expect(html).toContain(sheet.label);
      for (const s of sheet.sections) {
        if (s.kind === "table" && s.views[0]?.type === "segments") continue; // shown via the switcher
        expect(html, `${sheet.key}: ${s.title}`).toContain(escapeHtml(readableTitle(s.title)));
      }
      expect(html).not.toMatch(/Test Person|dangerouslySetInnerHTML/);
    }
  });
});

describe("report page details", () => {
  it("shows hero KPIs, caveats and verbatim quotes on the feedback report", async () => {
    const doc = await parseFile(FEEDBACK_FILE);
    const overview = renderToString(<ReportView doc={doc} />);
    expect(overview).toContain("+87"); // Organization NPS
    expect(overview).toContain("9.5"); // avg organization
    expect(overview).toContain("Как читать эти цифры");
    const themes = renderToString(<ReportView doc={doc} initialTab="themes" />);
    expect(themes).toContain("Пример ответа");
    expect(themes).toContain("Керемет кофе-брейк және спикерлер");
    const segments = renderToString(<ReportView doc={doc} initialTab="segments" />);
    expect(segments).toContain("малая выборка");
  });

  it("escapes text from the file", async () => {
    const doc = await parseFile(FEEDBACK_FILE);
    doc.sheets[0].sections.unshift({ kind: "callouts", id: "x", title: "X", items: [{ text: "<img src=x onerror=alert(1)>", tone: "info" }] });
    const html = renderToString(<ReportView doc={doc} />);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });
});

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}
