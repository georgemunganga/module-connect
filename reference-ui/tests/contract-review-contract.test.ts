import { afterEach, describe, expect, it, vi } from "vitest";
import { correctContractReview, decideContractReview, getAssignedContractReview,
  listAssignedContractReviews, recoverContractReview, submitContractReview,
} from "../../src/platform/procurement-contract-review-api";
import { clearContractReviewPending, readContractReviewPending, saveContractReviewPending,
  type ContractReviewPending } from "../../src/platform/contract-review-journal";

const company = "11111111-1111-4111-8111-111111111111";
const contract = "22222222-2222-4222-8222-222222222222";
const branch = "33333333-3333-4333-8333-333333333333";
const principal = "44444444-4444-4444-8444-444444444444";
const submission = "55555555-5555-4555-8555-555555555555";
const assignment = "66666666-6666-4666-8666-666666666666";
const key = "77777777-7777-4777-8777-777777777777";
const caseId = "88888888-8888-4888-8888-888888888888";
const ack = { schemaVersion: 1, ContractId: contract, SubmissionId: submission,
  ReviewBranchId: branch, VoteId: null, CorrectionId: null, Operation: "Submit",
  CommandKey: key, ActorPrincipalId: principal, contractVersion: 2,
  contractStatus: "PendingReview" };
afterEach(() => vi.unstubAllGlobals());

describe("held internal contract review API", () => {
  it("sends one scoped, versioned Submit with the original key and never retries a lost response", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("lost response")); vi.stubGlobal("fetch", fetch);
    await expect(submitContractReview(company,contract,key,1,branch)).rejects.toThrow("not be confirmed");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url,init] = fetch.mock.calls[0];
    expect(url).toBe(`/api/procurement/v1/contracts/${contract}/internal-review/submit`);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.headers.get("Idempotency-Key")).toBe(key);
    expect(init.headers.get("X-Shell-Entity")).toBe(company);
    expect(JSON.parse(init.body)).toEqual({ expectedContractVersion: 1, reviewBranchId: branch });
  });
  it("recovers the same actor-owned original acknowledgement and rejects a substituted contract", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(ack)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...ack, ContractId: branch })));
    vi.stubGlobal("fetch", fetch);
    expect((await recoverContractReview(company,contract,key,"Submit")).contractStatus).toBe("PendingReview");
    await expect(recoverContractReview(company,contract,key,"Submit")).rejects.toThrow("did not confirm");
    expect(fetch.mock.calls.every(([,init]) => !init.method || init.method === "GET")).toBe(true);
  });
  it("keeps Return/Reject reason and three CAS pins in one decision request", async () => {
    const vote = "99999999-9999-4999-8999-999999999999";
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...ack,
      Operation: "Decide", VoteId: vote, contractVersion: 3, contractStatus: "Returned" })));
    vi.stubGlobal("fetch", fetch);
    const result = await decideContractReview(company,contract,assignment,key,
      { expectedContractVersion: 2, expectedCaseVersion: 4, expectedAssignmentVersion: 3,
        action: "Return", reason: "Missing service evidence" });
    expect(result.contractStatus).toBe("Returned");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ expectedContractVersion: 2,
      expectedCaseVersion: 4, expectedAssignmentVersion: 3, action: "Return",
      reason: "Missing service evidence" });
    await expect(decideContractReview(company,contract,assignment,key,
      { expectedContractVersion: 2, expectedCaseVersion: 4, expectedAssignmentVersion: 3,
        action: "Reject", reason: " " })).rejects.toThrow("reason");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("requires the owning returned contract version and correction reason", async () => {
    const correction = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...ack,
      Operation: "Correction", CorrectionId: correction, contractStatus: "Draft", contractVersion: 4 })));
    vi.stubGlobal("fetch", fetch);
    expect((await correctContractReview(company,contract,key,3,"Revised terms")).contractStatus).toBe("Draft");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ expectedContractVersion: 3,
      reason: "Revised terms" });
  });
  it("does not turn submission ID into an assignment link when the server omits AssignmentId", async () => {
    const row = { Id: submission, ContractId: contract, CoreCaseId: caseId, ReviewBranchId: branch,
      SubmittedAt: "2026-10-24T12:00:00Z", SubmissionNumber: 1,
      Number: "CON-001", Title: "Maintenance", CurrencyCode: "ZMW", Version: 2 };
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      items: [row], total: 1, page: 1, pageSize: 25 })));
    vi.stubGlobal("fetch", fetch);
    const page = await listAssignedContractReviews(company);
    expect(page.items[0].AssignmentId).toBeUndefined();
    expect(page.items[0].Id).toBe(submission);
  });
  it("accepts only the current named assignment and frozen terms projection", async () => {
    const frozen = { schemaVersion: 1, contractId: contract, contractVersionId: caseId,
      contractVersion: 1, versionVersion: 1, Number: "CON-001", SupplierId: principal,
      Title: "Maintenance", ContractType: "Service", CurrencyCode: "ZMW",
      ceilingAmountExact: "99999999999999.9999", EffectiveFrom: null, ExpiresOn: null,
      RenewalNoticeOn: null, rates: [{ Id: submission, LineNumber: 1, Version: 1,
        Status: "Active", StatusReason: null, CatalogItemId: null,
        Description: "Service", UnitCode: "month", unitPriceExact: "0.0001",
        maximumQuantityExact: "2.0000" }] };
    const result = { Id: submission, ContractId: contract, CoreCaseId: caseId,
      ReviewBranchId: branch, SubmissionNumber: 1, SubmittedAt: "2026-10-24T12:00:00Z",
      TermsSha256: "a".repeat(64), terms: frozen, Number: "CON-001", Title: "Maintenance",
      SupplierId: principal, CurrencyCode: "ZMW", contractVersion: 2, caseVersion: 3,
      assignmentVersion: 1, assignmentId: assignment };
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(result)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...result, assignmentId: caseId })));
    vi.stubGlobal("fetch", fetch);
    expect((await getAssignedContractReview(company,contract,assignment)).terms.rates[0].unitPriceExact).toBe("0.0001");
    await expect(getAssignedContractReview(company,contract,assignment)).rejects.toThrow("invalid review details");
  });
});

describe("contract review uncertain-write locator", () => {
  it("stores only actor/scope/action/key and blocks a new POST until the original result is checked", () => {
    const values = new Map<string,string>();
    const storage = { getItem: (name: string) => values.get(name) ?? null,
      setItem: (name: string, value: string) => { values.set(name,value); },
      removeItem: (name: string) => { values.delete(name); } } as Storage;
    const pending: ContractReviewPending = { schemaVersion: 1, companyId: company,
      principalId: principal, contractId: contract, assignmentId: null,
      operation: "Submit", key };
    saveContractReviewPending(storage,pending);
    expect(readContractReviewPending(storage,{ companyId: company, principalId: principal,
      contractId: contract, assignmentId: null })).toEqual(pending);
    expect([...values.values()].join()).not.toContain("reason");
    withDuplicate();
    function withDuplicate() { expect(() => saveContractReviewPending(storage,pending)).toThrow("earlier"); }
    clearContractReviewPending(storage,pending);
    expect(values.size).toBe(0);
  });
});
