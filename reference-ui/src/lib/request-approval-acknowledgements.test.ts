import { afterEach, describe, expect, it, vi } from "vitest";
import { getApprovalAcknowledgement, readApprovalAcknowledgement, readBoundApprovalResult } from "../../../src/platform/procurement-approval-acknowledgements-api";
import type { ApprovalLocator, ApprovalJournalScope } from "./request-approval-journal";
const id = (n: number) => `${n.toString().padStart(8, "0")}-1111-4111-8111-111111111111`;
const scope: ApprovalJournalScope = { tenantId: "tenant", principalId: id(1), companyId: id(2), branchId: id(3), browserTabNonce: id(4) };
const open: ApprovalLocator = { locatorSchemaVersion: 1, operation: "Open", key: id(5), requestId: id(6), caseId: null,
  assignmentId: null, expectedRequestVersion: 4, expectedCaseVersion: null, expectedAssignmentVersion: null, fingerprint: "a".repeat(64) };
const decision: ApprovalLocator = { ...open, operation: "Decide", caseId: id(7), assignmentId: id(8), expectedCaseVersion: 2, expectedAssignmentVersion: 1 };
const opened = { caseId: id(7), requestId: id(6), submittedVersion: 3, requestVersion: 5, caseVersion: 1, state: "Pending", requestState: "Submitted", approvalState: "Pending" };
const decided = { ...opened, caseVersion: 3, state: "Approved", requestState: "Approved", approvalState: "Approved", assignmentId: id(8), assignmentVersion: 2, decisionId: id(9) };
const ack = (locator = open, result: unknown = opened) => ({ acknowledgementSchemaVersion: 1, acknowledgement: "Completed", operation: locator.operation,
  commandKey: locator.key, requestId: locator.requestId, caseId: id(7), assignmentId: locator.assignmentId, completedAt: "2026-10-22T12:00:00Z", result });
afterEach(() => vi.unstubAllGlobals());
describe("strict owning PR command acknowledgement", () => {
  it("accepts the exact8Open/11Decide original result without employee or invented wire version", () => {
    expect(readApprovalAcknowledgement(ack(), open).result).toEqual(opened);
    expect(readApprovalAcknowledgement(ack(decision, decided), decision).result).toEqual(decided);
  });
  it("binds a nonterminal approval to unchanged case/request and incremented assignment", () => {
    const pending = { ...opened, requestVersion: 4, caseVersion: 2, assignmentId: id(8), assignmentVersion: 2, decisionId: id(9) };
    expect(readBoundApprovalResult(pending, decision)).toEqual(pending);
    expect(() => readBoundApprovalResult({ ...pending, caseVersion: 3 }, decision)).toThrow();
  });
  it.each([{ acknowledgementSchemaVersion: 3 }, { commandKey: id(9) }, { requestId: id(9) }, { caseId: id(9) },
    { assignmentId: id(8) }, { operation: "Decide" }, { acknowledgement: "Pending" }, { completedAt: "invalid" }, { extra: true }])("rejects mismatched envelope %j", change => {
    expect(() => readApprovalAcknowledgement({ ...ack(), ...change }, open)).toThrow();
  });
  it.each([{ requestId: id(9) }, { requestVersion: 4 }, { approvalState: "Approved" }, { extra: true }, { assignmentId: id(8) }])("rejects wrong Open original %j", change => {
    expect(() => readBoundApprovalResult({ ...opened, ...change }, open)).toThrow();
  });
  it.each([{ caseId: id(9) }, { assignmentId: id(9) }, { assignmentVersion: 1 }, { decisionId: null }, { caseVersion: 2 }, { requestVersion: 7 }])("rejects wrong Decide original %j", change => {
    expect(() => readBoundApprovalResult({ ...decided, ...change }, decision)).toThrow();
  });
  it("uses GET with the exact original scope and no payload or idempotency POST", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(ack()))); vi.stubGlobal("fetch", fetcher);
    await getApprovalAcknowledgement(scope, open);
    expect(fetcher).toHaveBeenCalledWith(`/api/procurement/v1/requests/${open.requestId}/approval-commands/Open/${open.key}`,
      expect.objectContaining({ method: "GET", credentials: "include", cache: "no-store",
        headers: { "X-Shell-Entity": scope.companyId, "X-Shell-Location": scope.branchId } }));
    expect(fetcher.mock.calls[0][1].body).toBeUndefined();
  });
  it.each([403, 404, 409, 408, 429, 499, 503])("does not reinterpret HTTP%s as absence or completion", async status => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status })));
    await expect(getApprovalAcknowledgement(scope, open)).rejects.toMatchObject({ status });
  });
});
