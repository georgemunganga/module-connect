import { afterEach, describe, expect, it, vi } from "vitest";
import { commitMasterImport, getMasterImportSchema, previewMasterImport, recoverMasterImport } from "../../src/platform/procurement-master-import";

const company = "11111111-1111-4111-8111-111111111111";
const batchId = "33333333-3333-4333-8333-333333333333";
const digest = "a".repeat(64);
const key = "44444444-4444-4444-8444-444444444444";
const preview = { batchId, previewSha256: digest, expiresAt: "2026-10-27T12:00:00Z",
  rows: [{ rowNumber: 2, startLine: 2, endLine: 3, disposition: "error", code: "similar-vendor" }],
  willCreate: 0, willSkip: 0, willError: 1 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
afterEach(() => vi.unstubAllGlobals());

describe("server master import transport", () => {
  it("sends only mapped CSV to preview, then only the frozen batch, digest and original key to commit", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json(preview)).mockResolvedValueOnce(json({ batchId, created: 1, skipped: 0,
      rows: [{ rowNumber: 2, disposition: "create", recordId: "55555555-5555-4555-8555-555555555555" }] }));
    vi.stubGlobal("fetch", fetch);
    const body = { schemaVersion: 1, fileName: "vendors.csv", csvBase64: "YSxi", mapping: { A: "legalName" },
      duplicatePolicy: "reject" as const, acknowledgedSimilarityRows: [] };
    await previewMasterImport("vendors", company, body);
    const savedLocator = { batchId, previewSha256: digest, commandKey: key, expiresAt: "2099-01-01T00:00:00Z" };
    await commitMasterImport("vendors", company, savedLocator);
    expect(fetch.mock.calls[0][0]).toBe("/api/procurement/v1/vendors/import/preview");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(body);
    expect(fetch.mock.calls[0][1].credentials).toBe("include");
    expect(fetch.mock.calls[1][0]).toBe("/api/procurement/v1/vendors/import/commit");
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ batchId, previewSha256: digest, commandKey: key });
  });
  it("requires the server schema and exact preview row partition", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ schemaVersion: 1, kind: "vendors",
      fields: [{ key: "legalName", label: "Legal name", required: true }] }))
      .mockResolvedValueOnce(json({ ...preview, willCreate: 1 }));
    vi.stubGlobal("fetch", fetch);
    expect((await getMasterImportSchema("vendors", company)).fields[0].key).toBe("legalName");
    await expect(previewMasterImport("vendors", company, { schemaVersion: 1, fileName: "x.csv", csvBase64: "YQ==",
      mapping: {}, duplicatePolicy: "reject", acknowledgedSimilarityRows: [] })).rejects.toThrow(/preview/);
  });
  it("denies wrong batch recovery and a late response after scope cancellation", async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockResolvedValueOnce(json({ state: "Committed", batchId: "66666666-6666-4666-8666-666666666666",
      result: { batchId, created: 0, skipped: 0, rows: [] } }))
      .mockImplementationOnce(() => { controller.abort(); return Promise.resolve(json(preview)); });
    vi.stubGlobal("fetch", fetch);
    await expect(recoverMasterImport("vendors", company, batchId)).rejects.toThrow(/saved import/);
    await expect(previewMasterImport("vendors", company, { schemaVersion: 1, fileName: "x.csv", csvBase64: "YQ==",
      mapping: {}, duplicatePolicy: "reject", acknowledgedSimilarityRows: [] }, controller.signal)).rejects.toThrow();
  });
  it("does not treat a controlled unavailable response as a local import", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ code: "import-unavailable" }, 503)));
    await expect(getMasterImportSchema("items", company)).rejects.toThrow(/unavailable/);
  });
});
