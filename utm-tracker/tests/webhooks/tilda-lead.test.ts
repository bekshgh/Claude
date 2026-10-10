import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { logCreate, recordLead } = vi.hoisted(() => ({
  logCreate: vi.fn(async () => ({})),
  recordLead: vi.fn(async () => ({ leadId: "lead_1", deduped: false, attribution: "exact", hasClickId: true })),
}));
vi.mock("@/lib/db", () => ({ prisma: { webhookLog: { create: logCreate } } }));
vi.mock("@/lib/leads", () => ({ recordLead }));

import { POST } from "@/app/api/webhooks/tilda-lead/route";

const SECRET = "s3cret-value";

function post(body: Record<string, string>, { query = "", headers = {} }: { query?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(`http://x/api/webhooks/tilda-lead${query}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const loggedStatus = () => (logCreate.mock.calls.at(-1) as any)?.[0].data.status;

beforeEach(() => vi.stubEnv("WEBHOOK_SECRET", SECRET));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("Tilda webhook auth", () => {
  it("rejects a test ping without the secret", async () => {
    const res = await POST(post({ test: "test" }));
    expect(res.status).toBe(401);
    expect(loggedStatus()).toBe("unauthorized");
  });

  it("accepts a test ping that carries the secret", async () => {
    const res = await POST(post({ test: "test" }, { query: `?secret=${SECRET}` }));
    expect(res.status).toBe(200);
    expect(loggedStatus()).toBe("success");
  });

  it("rejects a wrong secret and a lead without one", async () => {
    expect((await POST(post({ name: "A" }, { headers: { "x-webhook-secret": "nope" } }))).status).toBe(401);
    expect((await POST(post({ name: "A" }))).status).toBe(401);
    expect(recordLead).not.toHaveBeenCalled();
  });

  it("accepts the secret from the header, the query or the body", async () => {
    expect((await POST(post({ name: "A" }, { headers: { "x-webhook-secret": SECRET } }))).status).toBe(200);
    expect((await POST(post({ name: "A" }, { query: `?secret=${SECRET}` }))).status).toBe(200);
    expect((await POST(post({ name: "A", token: SECRET }))).status).toBe(200);
    expect(recordLead).toHaveBeenCalledTimes(3);
  });

  it("never stores the secret with the lead or in the log", async () => {
    await POST(post({ name: "A", secret: SECRET, click_id: "c1" }));
    const stored = (recordLead.mock.calls[0] as any)[1].rawPayload;
    expect(stored).toEqual({ name: "A", click_id: "c1" });

    await POST(post({ name: "A", token: "wrong" }));
    expect(JSON.stringify((logCreate.mock.calls.at(-1) as any)[0].data.payload)).not.toContain("wrong");
  });
});
