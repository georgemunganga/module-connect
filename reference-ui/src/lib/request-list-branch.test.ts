import { afterEach, describe, expect, it, vi } from "vitest";
import { listOwnRequestDrafts } from "../../../src/platform/procurement-requests-api";

const company = "11111111-1111-4111-8111-111111111111";
const branch = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333";
afterEach(() => vi.unstubAllGlobals());

function respond(branchRef: unknown) {
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ entityId: company, branchScope: "all" }) });
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
    records: [{ id, number: "PR-TEST", purpose: "Supplies", status: "Draft", currencyCode: "ZMW",
      createdAt: "2026-10-25T12:00:00Z", version: 1, lineCount: 1, branchRef }],
    count: 1, limit: 50, offset: 0,
  }), { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

describe("request-list server branch references", () => {
  it.each([branch, null, undefined])("accepts the additive branch contract and legacy absence: %s", async value => {
    const fetcher = respond(value);
    const page = await listOwnRequestDrafts(company);
    expect(page.records[0].branchRef).toBe(value);
    const headers = new Headers(fetcher.mock.calls[0][1]?.headers);
    expect(headers.get("X-Shell-Entity")).toBe(company);
    expect(headers.get("X-Shell-Branch-Scope")).toBe("all");
    expect(headers.has("X-Shell-Location")).toBe(false);
  });
  it.each(["not-a-branch", { id: branch }])("rejects an unverified branch reference: %s", async value => {
    respond(value);
    await expect(listOwnRequestDrafts(company)).rejects.toThrow("invalid request list");
  });
});
