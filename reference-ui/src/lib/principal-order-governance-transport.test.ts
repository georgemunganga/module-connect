import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeGovernanceBody, getGovernedBuyerOrder, getGovernanceOperationDetail,
  getPrincipalFinanceDetail, getPrincipalReview, listGovernanceOperationWork, listGovernedBuyerOrders,
  listPrincipalAssignedReviews, listPrincipalFinanceWork, recoverGovernanceCommand,
  sendGovernanceCommand, validGovernanceCommand, type GovernanceCommand,
  type GovernanceOperation, type GovernanceReply } from "../../../src/platform/procurement-principal-governance-api";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const sourceDigest = "a".repeat(64);
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const bodies: Record<GovernanceOperation, string> = {
  Funding: encodeGovernanceBody("Funding", { expectedOrderVersion: 1, manualCommitmentReference: "COM-1",
    externalEvidenceReference: "EXT-1", currencyCode: "ZMW", attestedGrossAmount: "10.00000001",
    sourceReservationReferences: ["RES-1"], observedAt: "2026-10-26T20:00:00Z" }),
  Submit: encodeGovernanceBody("Submit", { expectedOrderVersion: 1 }),
  Decide: encodeGovernanceBody("Decide", { action: "Approve", reason: null,
    expectedOrderVersion: 2, expectedCaseVersion: 1, expectedAssignmentVersion: 1 }),
  Issue: encodeGovernanceBody("Issue", { expectedOrderVersion: 3 }),
  Ack: encodeGovernanceBody("Ack", { expectedOrderVersion: 4, issuedVersionId: id(7),
    outcome: "Accepted", channel: "Hand delivery", supplierReference: "SUP-1",
    evidenceReference: "ACK-1", observedAt: "2026-10-26T20:00:00Z" }),
  ReleaseRequest: encodeGovernanceBody("ReleaseRequest", { expectedOrderVersion: 2,
    originalDirectSourceSha256: sourceDigest, reason: "No longer required" }),
  ReleaseConfirm: encodeGovernanceBody("ReleaseConfirm", { expectedOrderVersion: 3,
    releaseRequestId: id(8), externalReleaseEvidenceReference: "REL-1", currencyCode: "ZMW",
    releasedGrossAmount: "10.00000001", restoredSourceReservationReferences: ["RES-1"],
    confirmedAt: "2026-10-26T20:00:00Z" }),
};
const expected: Record<GovernanceOperation, { status: string; http: number; suffix: string }> = {
  Funding: { status: "Draft", http: 200, suffix: "principal-funding" },
  Submit: { status: "PendingApproval", http: 201, suffix: "principal-submit" },
  Decide: { status: "Approved", http: 200, suffix: `principal-decisions/${id(9)}` },
  Issue: { status: "IssuePending", http: 201, suffix: "principal-issue" },
  Ack: { status: "Issued", http: 200, suffix: "principal-acknowledgment" },
  ReleaseRequest: { status: "ReleasePending", http: 200, suffix: "principal-release-request" },
  ReleaseConfirm: { status: "Cancelled", http: 200, suffix: "principal-release-confirmation" },
};
const command = (operation: GovernanceOperation): GovernanceCommand => ({ operation, key: id(2),
  orderId: id(3), assignmentId: operation === "Decide" ? id(9) : null,
  expectedOriginalDirectSourceSha256: sourceDigest, body: bodies[operation] });
const saved = (operation: GovernanceOperation): GovernanceReply => ({ schemaVersion: 2, operation,
  orderId: id(3), number: "PO-1", status: expected[operation].status as GovernanceReply["status"],
  version: 2, originalDirectSourceSha256: sourceDigest, commandKey: id(2), evidenceId: id(4),
  recordedHistoricalResult: true, manualFundingOnly: true,
  financeReservationChanged: false, supplierSendPerformed: false });
const receipt = (operation: GovernanceOperation, body: unknown = saved(operation)) => ({
  operation, commandKey: id(2), originalStatusCode: expected[operation].http,
  responseJson: JSON.stringify(body), recordedHistoricalResult: true, historicalOnly: true,
  financeReservationChanged: false, supplierSendPerformed: false,
});
afterEach(() => vi.unstubAllGlobals());

describe("principal order governance transport", () => {
  it.each(Object.keys(expected) as GovernanceOperation[])("sends one exact %s command with its own key and route", async operation => {
    const fetcher = vi.fn(async () => response(saved(operation), expected[operation].http));
    vi.stubGlobal("fetch", fetcher);
    expect((await sendGovernanceCommand(id(1), command(operation))).operation).toBe(operation);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`/${id(3)}/${expected[operation].suffix}`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(bodies[operation]);
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe(id(2));
    expect(init.credentials).toBe("include");
  });
  it.each(Object.keys(expected) as GovernanceOperation[])("recovers %s through GET without replaying POST", async operation => {
    const fetcher = vi.fn(async () => response(receipt(operation)));
    vi.stubGlobal("fetch", fetcher);
    expect((await recoverGovernanceCommand(id(1), command(operation))).evidenceId).toBe(id(4));
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`/principal-governance-command-receipts/${operation}/${id(2)}`);
    expect(init.method).toBeUndefined();
  });
  it("keeps exact gross scale eight and rejects JS number or rounding inputs", () => {
    expect(bodies.Funding).toContain('"attestedGrossAmount":"10.00000001"');
    expect(bodies.ReleaseConfirm).toContain('"releasedGrossAmount":"10.00000001"');
    expect(() => encodeGovernanceBody("Funding", { ...JSON.parse(bodies.Funding),
      attestedGrossAmount: "999999999999999999999999999999.99999999" })).not.toThrow();
    expect(() => encodeGovernanceBody("Funding", { ...JSON.parse(bodies.Funding),
      attestedGrossAmount: "0.00000000" })).not.toThrow();
    expect(() => encodeGovernanceBody("ReleaseConfirm", { ...JSON.parse(bodies.ReleaseConfirm),
      releasedGrossAmount: "0" })).not.toThrow();
    expect(() => encodeGovernanceBody("Funding", { ...JSON.parse(bodies.Funding),
      attestedGrossAmount: "9999999999999999999999999999999.99999999" })).toThrow();
    expect(() => encodeGovernanceBody("Funding", { ...JSON.parse(bodies.Funding),
      attestedGrossAmount: 10.00000001 })).toThrow();
    expect(() => encodeGovernanceBody("ReleaseConfirm", { ...JSON.parse(bodies.ReleaseConfirm),
      releasedGrossAmount: "10.000000001" })).toThrow();
    expect(validGovernanceCommand({ ...command("Submit"), body: '{"expectedOrderVersion":1,"extra":true}' }))
      .toBe(false);
  });
  it("preserves an optional named approver comment without weakening required Return reasons", () => {
    expect(encodeGovernanceBody("Decide", { action: "Approve", reason: "Checked sources and funding",
      expectedOrderVersion: 2, expectedCaseVersion: 1, expectedAssignmentVersion: 1 }))
      .toContain('"reason":"Checked sources and funding"');
    expect(() => encodeGovernanceBody("Decide", { action: "Return", reason: null,
      expectedOrderVersion: 2, expectedCaseVersion: 1, expectedAssignmentVersion: 1 })).toThrow();
  });
  it("rejects substituted actor receipt fields and never retries", async () => {
    for (const wrong of [
      { ...receipt("Decide"), commandKey: id(99) },
      { ...receipt("Decide"), originalStatusCode: 201 },
      { ...receipt("Decide"), responseJson: JSON.stringify({ ...saved("Decide"), evidenceId: id(0) }) },
      { ...receipt("Decide"), responseJson: JSON.stringify({ ...saved("Decide"), orderId: id(99) }) },
      { ...receipt("Decide"), responseJson: JSON.stringify({ ...saved("Decide"), operation: "Submit" }) },
      { ...receipt("Decide"), responseJson: JSON.stringify({ ...saved("Decide"), originalDirectSourceSha256: "b".repeat(64) }) },
    ]) {
      const fetcher = vi.fn(async () => response(wrong)); vi.stubGlobal("fetch", fetcher);
      await expect(recoverGovernanceCommand(id(1), command("Decide"))).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it("accepts governed same-row read only with truthful current actions and line pins", async () => {
    const detail = { schemaVersion: 2, id: id(3), number: "PO-1", status: "PendingApproval",
      version: 3, currentRevision: 1, originalDirectSourceSha256: sourceDigest,
      supplierId: id(5), supplierDisplayName: "Supplier", branchRef: id(6), branchDisplayName: "HQ",
      currencyCode: "ZMW", grossAmountExact: "10.00000001",
      funding: { id: id(7), manualCommitmentReference: "COM-1", externalEvidenceReference: "EXT-1",
        approvedManualPolicyReference: "POL-1", observedAt: "2026-10-26T20:00:00+00:00" },
      submission: { id: id(8), coreApprovalCaseId: id(13), submittedAt: "2026-10-26T20:00:00Z",
        caseState: "Pending", caseVersion: 1 },
      issuedVersion: null, acknowledgment: null, release: null,
      lines: [{ id: id(10), lineNumber: 1, description: "Item", unitCode: "EA", quantity: "2.0000",
        unitPrice: "5.0000", taxAmount: "0.0000", purchaseRequestId: id(11),
        purchaseRequestLineId: id(12), allocationStatus: "Reserved" }],
      canSubmit: false, canIssue: false, canCancelDraft: false, canRequestRelease: true,
      canRecordAcknowledgment: false, allowedDeliveryChannels: [],
      actionEligibilityIsCurrentPreview: true, actionsRevalidatedOnSave: true,
      manualExternalEvidenceOnly: true, financeLedgerChanged: false, supplierSendPerformed: false };
    vi.stubGlobal("fetch", vi.fn(async () => response(detail)));
    expect((await getGovernedBuyerOrder(id(1), id(3))).status).toBe("PendingApproval");
    vi.stubGlobal("fetch", vi.fn(async () => response({ ...detail,
      lines: [{ ...detail.lines[0], quantity: "2.00001" }] })));
    await expect(getGovernedBuyerOrder(id(1), id(3))).rejects.toThrow();
    for (const [operation, status] of [["Issue", "Approved"], ["Ack", "IssuePending"]] as const) {
      const fetcher = vi.fn(async (_input: RequestInfo | URL) => response({ ...detail, status }));
      vi.stubGlobal("fetch", fetcher);
      expect((await getGovernanceOperationDetail(id(1), id(3), operation)).status).toBe(status);
      expect(String(fetcher.mock.calls[0][0])).toContain(`/principal-operation-detail?operation=${operation}`);
    }
  });
  it.each(["Issue", "Ack"] as const)("reads the scoped %s task queue without buyer PO read", async operation => {
    const status = operation === "Issue" ? "Approved" : "IssuePending";
    const row = { id: id(3), number: "PO-1", supplierId: id(4), branchRef: id(5),
      currencyCode: "ZMW", status, version: 5, currentRevision: 1 };
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => response({ items: [row], total: 1,
      page: 1, pageSize: 25, operation, detailEligibilityRequired: true, readOnlyPreview: true }));
    vi.stubGlobal("fetch", fetcher);
    expect((await listGovernanceOperationWork(id(1), operation, 1)).items[0].id).toBe(id(3));
    expect(String(fetcher.mock.calls[0][0])).toContain(`/principal-operation-work?operation=${operation}`);
  });
  it("lists the same governed PO IDs across non-Draft states", async () => {
    const row = { id: id(3), number: "PO-1", supplierId: id(4), branchRef: id(5),
      currencyCode: "ZMW", status: "IssuePending", version: 5, currentRevision: 1,
      createdAt: "2026-10-26T20:00:00+00:00", originalDirectSourceSha256: sourceDigest };
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => response({ items: [row], total: 1, page: 1, pageSize: 25,
      schemaVersion: 2, readOnlyPreview: true })); vi.stubGlobal("fetch", fetcher);
    expect((await listGovernedBuyerOrders(id(1), 1)).items[0].id).toBe(id(3));
    expect(String(fetcher.mock.calls[0][0])).toContain("/principal-governed-orders?page=1");
  });
  it("uses Finance work without broad buyer PO read", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => response({ items: [{ id: id(3), number: "PO-1",
      supplierId: id(4), branchRef: id(5), currencyCode: "ZMW", status: "Draft", version: 1,
      grossAmountExact: "10.00000001", releaseRequestId: null,
      task: "Record external commitment", externalFinanceEvidenceRequired: true, previewOnly: true }],
      total: 1, page: 1, pageSize: 25, manualExternalEvidenceOnly: true,
      financeLedgerChanged: false })); vi.stubGlobal("fetch", fetcher);
    expect((await listPrincipalFinanceWork(id(1), 1)).items[0].id).toBe(id(3));
    expect(String(fetcher.mock.calls[0][0])).toContain("/principal-finance-work?");
  });
  it.each(["Draft", "ReleasePending"] as const)("retains %s Finance detail when writes are disabled", async status => {
    const detail = { id: id(3), number: "PO-1", status, version: 2, branchRef: id(5),
      currencyCode: "ZMW", originalDirectSourceSha256: sourceDigest,
      grossAmountExact: "10.00000001", sourceReservationReferences: ["RES-1"],
      canRecordFunding: false, canConfirmRelease: false, previewOnly: true,
      financeLedgerChanged: false, funding: null, release: null };
    vi.stubGlobal("fetch", vi.fn(async () => response(detail)));
    expect((await getPrincipalFinanceDetail(id(1), id(3))).status).toBe(status);
  });
  it("uses exact named Core assignment rather than buyer detail for decisions", async () => {
    const item = { orderId: id(3), number: "PO-1", status: "PendingApproval", version: 2,
      branchRef: id(5), assignmentId: id(9), assignmentVersion: 1, caseId: id(7),
      caseVersion: 1, openedAt: "2026-10-26T20:00:00+00:00", grossAmountExact: "10.00000001" };
    const detail = { id: id(3), number: "PO-1", status: "PendingApproval", version: 2,
      originalDirectSourceSha256: sourceDigest,
      currencyCode: "ZMW", grossAmountExact: "10.00000001", lineBaseAmountExact: "10.00000001",
      lines: [{ id: id(12), lineNumber: 1, description: "Item", unitCode: "EA",
        quantity: "2", unitPrice: "5", taxAmount: "0" }],
      manualCommitmentReference: "COM-1", externalEvidenceReference: "EXT-1",
      approvedManualPolicyReference: "POL-1",
      assignmentId: id(9), assignmentState: "Pending", assignmentVersion: 1, coreCaseId: id(7), caseVersion: 1,
      canApprove: false, canReturn: true, canReject: true, approvalNeedsReview: true,
      financePostingCreated: false, supplierSendPerformed: false };
    const fetcher = vi.fn().mockResolvedValueOnce(response({ items: [item], total: 1, page: 1,
      pageSize: 25, assignedToCurrentPrincipal: true, financePostingCreated: false,
      supplierSendPerformed: false })).mockResolvedValueOnce(response(detail));
    vi.stubGlobal("fetch", fetcher);
    expect((await listPrincipalAssignedReviews(id(1), 1)).items[0].assignmentId).toBe(id(9));
    expect((await getPrincipalReview(id(1), id(3), id(9))).canReturn).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => response({ ...detail,
      originalDirectSourceSha256: "invalid" })));
    await expect(getPrincipalReview(id(1), id(3), id(9))).rejects.toThrow();
    const missingPin = { ...detail } as Record<string, unknown>;
    delete missingPin.originalDirectSourceSha256;
    vi.stubGlobal("fetch", vi.fn(async () => response(missingPin)));
    await expect(getPrincipalReview(id(1), id(3), id(9))).rejects.toThrow();
    expect(String(fetcher.mock.calls[0][0])).toContain("/principal-assigned-reviews?");
    expect(String(fetcher.mock.calls[1][0])).toContain(`/${id(3)}/principal-review/${id(9)}`);
  });
});
