import { afterEach, describe, expect, it, vi } from "vitest";
import { exactRequestPayload, readExactRequestDraft, createOwnRequestDraft, updateOwnRequestDraft, getOwnRequestDraft, type RequestDetail } from "../../../src/platform/procurement-requests-api";
import { requestBaseAmount, formatRequestBaseAmount } from "./request-draft-values";
const company = "11111111-1111-4111-8111-111111111111", id = "22222222-2222-4222-8222-222222222222", lineId = "33333333-3333-4333-8333-333333333333";
const detail: RequestDetail = { id, number: "PR-EXACT", purpose: "Exact original", status: "Draft", currencyCode: "ZMW", neededBy: null,
  createdAt: "2026-10-22T00:00:00Z", version: 2, lineCount: 1, requestEditVersion: 1, costCenterRef: null, projectRef: null,
  deliveryLocationRef: "Retained location", deliveryAddressText: null, fundingSourceRef: null, notesToApprover: null,
  lines: [{ id: lineId, lineNumber: 1, description: "Wide original", unitCode: "each", approvalStatus: "Pending", requestedQuantity: 1,
    estimatedUnitPrice: 12345678901234.568, discountPercent: 12.3456, catalogItemId: company, catalogEntryId: id, catalogPublishedVersion: 3,
    preferredSupplierId: lineId, categoryCode: "OFFICE", purchaseType: "Goods", neededBy: null,
    taxCodeRef: "Retained tax", costCenterRef: "Retained cost", projectRef: "Retained project", specificationDocumentRefId: company,
    exactAmounts: { requestedQuantity: "1", estimatedUnitPrice: "12345678901234.5678", discountPercent: "12.3456" } }] };
afterEach(() => vi.unstubAllGlobals());
describe("exact request edit boundary", () => {
  it("loads owner companions and all hidden owned fields without recovering money from approximate numbers", () => {
    const draft = readExactRequestDraft(detail);
    expect(draft.lines[0].estimatedUnitPrice).toBe("12345678901234.5678"); expect(draft.lines[0].discountPercent).toBe("12.3456");
    expect(draft.lines[0]).toMatchObject({ catalogEntryId: id, catalogPublishedVersion: 3, preferredSupplierId: lineId,
      taxCodeRef: "Retained tax", costCenterRef: "Retained cost", projectRef: "Retained project", specificationDocumentRefId: company });
    expect(draft.deliveryLocationRef).toBe("Retained location");
  });
  it("does not edit older or incomplete owner projections", () => {
    expect(() => readExactRequestDraft({ ...detail, requestEditVersion: undefined })).toThrow(/unavailable/);
    expect(() => readExactRequestDraft({ ...detail, lines: [{ ...detail.lines[0], exactAmounts: undefined }] })).toThrow(/unavailable/);
    const incomplete = { ...detail }; delete incomplete.deliveryLocationRef;
    expect(() => readExactRequestDraft(incomplete)).toThrow(/unavailable/);
    const line = { ...detail.lines[0] }; delete line.taxCodeRef;
    expect(() => readExactRequestDraft({ ...detail, lines: [line] })).toThrow(/unavailable/);
  });
  it("rejects malformed exacts and unsafe CAS instead of falling back numeric", () => {
    expect(() => readExactRequestDraft({ ...detail, version: Number.MAX_SAFE_INTEGER + 1 })).toThrow();
    for (const value of ["1.00001", "-1", "1E-04", "100000000000000"])
      expect(() => readExactRequestDraft({ ...detail, lines: [{ ...detail.lines[0], exactAmounts: { ...detail.lines[0].exactAmounts!, estimatedUnitPrice: value } }] })).toThrow();
  });
  it("whitelists only mutable draft fields and preserves original bindings as decimal strings", () => {
    const draft = exactRequestPayload(readExactRequestDraft(detail));
    expect(draft.lines[0].requestedQuantity).toBe("1"); expect(draft.lines[0].estimatedUnitPrice).toBe("12345678901234.5678");
    expect(draft.lines[0]).not.toHaveProperty("approvalStatus"); expect(draft.lines[0]).not.toHaveProperty("exactAmounts");
    expect(draft).not.toHaveProperty("requestEditVersion");
    expect(draft.lines[0].specificationDocumentRefId).toBe(company);
  });
  it("retains exact eight-place products and aggregate without currency rounding", () => {
    const tiny = { description: "Tiny", unitCode: "each", requestedQuantity: "0.0001", estimatedUnitPrice: "0.0001" };
    expect(requestBaseAmount([tiny, tiny])).toBe("0.00000002");
    const wide = { ...tiny, requestedQuantity: "1", estimatedUnitPrice: "12345678901234.5678" };
    expect(requestBaseAmount([wide, tiny])).toBe("12345678901234.56780001");
    expect(formatRequestBaseAmount(requestBaseAmount([wide, tiny]))).toBe("12,345,678,901,234.56780001");
  });
  it("sends decimal strings/current CAS and confirms current exact owner details", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...detail, version: 3 }))); vi.stubGlobal("fetch", fetcher);
    const draft = readExactRequestDraft(detail); await updateOwnRequestDraft(company, id, 2, draft);
    const [url, init] = fetcher.mock.calls[0]; expect(url).toContain(`/requests/${id}`); expect(init.method).toBe("PUT");
    const payload = JSON.parse(init.body); expect(payload.version).toBe(2); expect(payload.lines[0].estimatedUnitPrice).toBe("12345678901234.5678");
    expect(payload.lines[0].catalogEntryId).toBe(id); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("invalid input has no POST and wrong current receipt is unconfirmed", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...detail, id: company, version: 3 }))); vi.stubGlobal("fetch", fetcher);
    const draft = readExactRequestDraft(detail);
    await expect(createOwnRequestDraft(company, { ...draft, lines: [{ ...draft.lines[0], estimatedUnitPrice: "0.00001" }] })).rejects.toMatchObject({ status: 422 });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(updateOwnRequestDraft(company, id, 2, draft)).rejects.toMatchObject({ status: 0 }); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("keeps existing readonly detail available without marker, while edit projection stays denied", async () => {
    const old = { ...detail, requestEditVersion: undefined }; vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(old))));
    const saved = await getOwnRequestDraft(company, id); expect(saved.id).toBe(id); expect(() => readExactRequestDraft(saved)).toThrow();
  });
});
