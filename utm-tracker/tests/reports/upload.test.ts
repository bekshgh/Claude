import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import { canView, newSlug, readUpload } from "@/lib/reports/store";
import { FEEDBACK_FILE, load } from "./helpers";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function upload(bytes: Uint8Array, name: string, type = XLSX, fields: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("file", new File([new Uint8Array(bytes)], name, { type }));
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new Request("http://x/api/reports", { method: "POST", body: fd });
}

async function errorOf(req: Request) {
  const r = await readUpload(req);
  expect(r).toBeInstanceOf(NextResponse);
  const res = r as NextResponse;
  return { status: res.status, ...(await res.json()) };
}

describe("upload validation", () => {
  it("accepts a valid workbook and parses it in memory", async () => {
    const r = await readUpload(upload(load(FEEDBACK_FILE), "OZGE feedback.xlsx", XLSX, { eventName: "ÖZGE S'26" }));
    expect(r).not.toBeInstanceOf(NextResponse);
    if (r instanceof NextResponse) return;
    expect(r.doc.type).toBe("feedback");
    expect(r.eventName).toBe("ÖZGE S'26");
  });

  it("rejects .xlsm, other extensions, wrong MIME and missing file", async () => {
    expect(await errorOf(upload(load(FEEDBACK_FILE), "a.xlsm"))).toMatchObject({ status: 422, code: "macro" });
    expect(await errorOf(upload(load(FEEDBACK_FILE), "a.csv"))).toMatchObject({ status: 422, code: "not_xlsx" });
    expect(await errorOf(upload(load(FEEDBACK_FILE), "a.xlsx", "text/html"))).toMatchObject({ status: 422, code: "not_xlsx" });
    const empty = new Request("http://x", { method: "POST", body: new FormData() });
    expect(await errorOf(empty)).toMatchObject({ status: 400, code: "no_file" });
  });

  it("turns parser refusals into readable 4xx errors, not 500", async () => {
    expect(await errorOf(upload(new TextEncoder().encode("not a zip"), "a.xlsx"))).toMatchObject({ status: 422, code: "not_xlsx" });
    expect(await errorOf(upload(new Uint8Array(5 * 1024 * 1024), "a.xlsx"))).toMatchObject({ status: 413, code: "too_large" });
  });

  it("refuses a manual type that contradicts the file", async () => {
    const r = await errorOf(upload(load(FEEDBACK_FILE), "a.xlsx", XLSX, { type: "registration" }));
    expect(r).toMatchObject({ status: 422, code: "type_mismatch" });
  });
});

describe("access rules", () => {
  it("only published link/public reports are visible to visitors", () => {
    expect(canView({ status: "published", visibility: "link" }, false)).toBe(true);
    expect(canView({ status: "published", visibility: "public" }, false)).toBe(true);
    expect(canView({ status: "published", visibility: "private" }, false)).toBe(false);
    expect(canView({ status: "draft", visibility: "link" }, false)).toBe(false);
    expect(canView({ status: "draft", visibility: "private" }, true)).toBe(true);
  });

  it("slugs are readable but not guessable", () => {
    const s = newSlug("ÖZGE Forum S'26 feedback");
    expect(s).toMatch(/^ozge-forum-s-26-feedback-[0-9a-f]{8}$/);
    expect(newSlug("ÖZGE Forum S'26 feedback")).not.toBe(s);
  });
});
