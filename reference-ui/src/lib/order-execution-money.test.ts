import { describe, expect, it } from "vitest";
import { encodeExactOrderDraft, orderCommandBody, selectCurrentCommercialEvidence, sourceOrderCommandBody, type ExecutionOrderDetail } from "../../../src/platform/procurement-order-execution-api";

describe("order execution decimal transport", () => {
  it("retains a wide exact product and version/reference fields without Number conversion", () => {
    const body = orderCommandBody({ expectedOrderVersion: 8, evidenceReference: 'verified "value"' }, { confirmedGrossAmount: "99999999999999.99990001" });
    expect(body).toBe(String.raw`{"expectedOrderVersion":8,"evidenceReference":"verified \"value\"","confirmedGrossAmount":99999999999999.99990001}`);
  });
  it.each(["01", "1e3", "NaN", "Infinity", "1,000", "1.123456789", '1,"status":"Approved"'])('rejects noncanonical or injected amount %s', (amount) => {
    expect(() => orderCommandBody({}, { releasedGrossAmount: amount })).toThrow("represented exactly");
  });
  it("rejects duplicate monetary keys instead of relying on JSON last-key behavior", () => {
    expect(() => orderCommandBody({ confirmedGrossAmount: "1" }, { confirmedGrossAmount: "2" })).toThrow("represented exactly");
  });
});

describe("linked order payloads", () => {
  const draft = { supplierId: "11111111-1111-4111-8111-111111111111", currencyCode: "ZMW", shipToRef: "", billToRef: "", paymentTermRef: "", expectedDeliveryOn: null,
    lines: [{ description: "Approved source", unitCode: "EA", quantity: "2.1250", unitPrice: "99.1234", taxAmount: "0", projectRef: undefined }] };
  it("keeps raw exact quantities/prices, safely omitting undefined optional fields", () => {
    const encoded = encodeExactOrderDraft(draft);
    expect(encoded).toContain('"quantity":2.1250'); expect(encoded).toContain('"unitPrice":99.1234'); expect(encoded).not.toContain("undefined");
    expect(JSON.parse(encoded).lines[0]).toMatchObject({ quantity: 2.125, unitPrice: 99.1234 });
  });
  it("pins every source to its selected request version and draft index", () => {
    const source = { requestId: "22222222-2222-4222-8222-222222222222", lineId: "33333333-3333-4333-8333-333333333333", requestNumber: "PR-1", requestVersion: 7, eligibility: "Available" };
    const encoded = sourceOrderCommandBody(draft, [source]);
    expect(JSON.parse(encoded).sources).toEqual([{ draftLineIndex: 0, purchaseRequestId: source.requestId, purchaseRequestLineId: source.lineId, expectedRequestVersion: 7 }]);
    expect(() => sourceOrderCommandBody(draft, [])).toThrow("Every order line");
  });
  it("retains source-edit line identity and does not introduce new source selections", () => {
    const encoded = sourceOrderCommandBody({ ...draft, lines: [{ ...draft.lines[0], id: "44444444-4444-4444-8444-444444444444" }] }, 5, "  Lower quantity  ");
    expect(JSON.parse(encoded)).toMatchObject({ expectedOrderVersion: 5, reason: "Lower quantity", draft: { lines: [{ id: "44444444-4444-4444-8444-444444444444" }] } });
    expect(JSON.parse(encoded).sources).toBeUndefined();
  });
  it("rejects excess source precision before creating a command", () => {
    expect(() => encodeExactOrderDraft({ ...draft, lines: [{ ...draft.lines[0], quantity: "0.12345" }] })).toThrow("four decimal places");
  });
});

describe("current commercial evidence", () => {
  const first = "11111111-1111-4111-8111-111111111111", current = "22222222-2222-4222-8222-222222222222";
  const evidence = (id: string) => ({ id, commitmentReference: id, evidenceReference: id, confirmedGrossAmount: "1", currencyCode: "ZMW", commercialRevision: 1,
    confirmedAt: "2026-10-22T00:00:00Z", releaseConfirmed: false, evidenceMode: "ApprovedManualEvidence" });
  const detail = { commercialEvidenceSelectionVersion: 1, latestFinanceEvidenceId: current, latestIssuedVersionId: null,
    financeEvidence: [evidence(first), evidence(current)], issued: [] } as unknown as ExecutionOrderDetail;
  it("uses the server pointer even when current evidence is not first in history", () => {
    expect(selectCurrentCommercialEvidence(detail)?.finance?.id).toBe(current);
  });
  it("rejects missing, stale, repeated or contradictory evidence pointers", () => {
    expect(selectCurrentCommercialEvidence({ ...detail, commercialEvidenceSelectionVersion: undefined })).toBeNull();
    expect(selectCurrentCommercialEvidence({ ...detail, latestFinanceEvidenceId: null })).toBeNull();
    expect(selectCurrentCommercialEvidence({ ...detail, latestFinanceEvidenceId: "33333333-3333-4333-8333-333333333333" })).toBeNull();
    expect(selectCurrentCommercialEvidence({ ...detail, financeEvidence: [evidence(current), evidence(current)] })).toBeNull();
    expect(selectCurrentCommercialEvidence({ ...detail, latestIssuedVersionId: first })).toBeNull();
  });
});
