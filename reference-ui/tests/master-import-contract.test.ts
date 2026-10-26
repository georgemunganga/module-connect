import { afterEach, describe, expect, it, vi } from "vitest";
import { commitMasterImport, getMasterImportSchema, previewMasterImport, recoverMasterImport } from "../../src/platform/procurement-master-import";

const company = "11111111-1111-4111-8111-111111111111";
const batchId = "33333333-3333-4333-8333-333333333333";
const digest = "a".repeat(64);
const key = "44444444-4444-4444-8444-444444444444";
const preview = { batchId, previewSha256: digest, expiresAt: "2026-10-27T12:00:00Z",
  rows: [{ rowNumber: 2, startLine: 2, endLine: 3, disposition: "error", code: "similar-vendor", message: "Review this name." }],
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
  it("accepts actual nullable preview fields and exact created/skipped record IDs", async () => {
    const clean = { ...preview, rows: [{ rowNumber: 2, startLine: 2, endLine: 2,
      disposition: "create", code: null, message: null }], willCreate: 1, willError: 0 };
    const mixed = { batchId, created: 1, skipped: 1, rows: [
      { rowNumber: 2, disposition: "create", recordId: "55555555-5555-4555-8555-555555555555" },
      { rowNumber: 3, disposition: "skip", recordId: null },
    ] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(clean)).mockResolvedValueOnce(json(mixed))
      .mockResolvedValueOnce(json({ ...mixed, created: 0, rows: [{ rowNumber: 3, disposition: "skip", recordId: null }], skipped: 1 })));
    expect((await previewMasterImport("vendors", company, { schemaVersion: 1, fileName: "v.csv", csvBase64: "YQ==",
      mapping: {}, duplicatePolicy: "reject", acknowledgedSimilarityRows: [] })).rows[0].code).toBeNull();
    expect((await commitMasterImport("vendors", company, { batchId, previewSha256: digest, commandKey: key })).rows[1].recordId).toBeNull();
    expect((await commitMasterImport("vendors", company, { batchId, previewSha256: digest, commandKey: key })).skipped).toBe(1);
  });
  it("rejects a missing created ID, a skipped existing ID, and a vague expiry", async () => {
    const invalids = [
      { batchId, created: 1, skipped: 0, rows: [{ rowNumber: 2, disposition: "create" }] },
      { batchId, created: 0, skipped: 1, rows: [{ rowNumber: 2, disposition: "skip", recordId: "55555555-5555-4555-8555-555555555555" }] },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(invalids[0])).mockResolvedValueOnce(json(invalids[1]))
      .mockResolvedValueOnce(json({ ...preview, expiresAt: "tomorrow" })));
    for (const _ of invalids) await expect(commitMasterImport("vendors", company,
      { batchId, previewSha256: digest, commandKey: key })).rejects.toThrow(/result/);
    await expect(previewMasterImport("vendors", company, { schemaVersion: 1, fileName: "v.csv", csvBase64: "YQ==",
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
  it("treats only the persisted exact Expired envelope as terminal, while clock-expired Previewed stays pending", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ state: "Previewed", ...preview, expiresAt: "2020-01-01T00:00:00Z" }))
      .mockResolvedValueOnce(json({ state: "Expired", batchId }))
      .mockResolvedValueOnce(json({ state: "Expired", batchId, expiresAt: "2020-01-01T00:00:00Z" }));
    vi.stubGlobal("fetch", fetch);
    expect((await recoverMasterImport("vendors", company, batchId)).state).toBe("Previewed");
    expect(await recoverMasterImport("vendors", company, batchId)).toEqual({ state: "Expired", batchId });
    await expect(recoverMasterImport("vendors", company, batchId)).rejects.toThrow(/saved import/);
  });
  it("reports the server preview quota without claiming or committing a batch", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ code: "import-staging-full" }, 429));
    vi.stubGlobal("fetch", fetch);
    await expect(previewMasterImport("vendors", company, { schemaVersion: 1, fileName: "v.csv", csvBase64: "YQ==",
      mapping: {}, duplicatePolicy: "reject", acknowledgedSimilarityRows: [] })).rejects.toThrow(/capacity is full/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
