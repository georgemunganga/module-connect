import { afterEach, describe, expect, it, vi } from "vitest";
import { decidePublicationReview, getPublication, listAssignedPublicationReviews, listPublications,
  openPublicationReview, recoverPublicationCommand, searchPublicationSuppliers, type PublicationDetail } from "../../src/platform/procurement-sourcing-publication-api";
import { readPublicationRecovery, writePublicationRecovery } from "../src/lib/rfq-publication-command-journal";

const company = "11111111-1111-4111-8111-111111111111";
const event = "22222222-2222-4222-8222-222222222222";
const source = "33333333-3333-4333-8333-333333333333";
const line = "44444444-4444-4444-8444-444444444444";
const supplier = "55555555-5555-4555-8555-555555555555";
const caseId = "77777777-7777-4777-8777-777777777777";
const assignment = "88888888-8888-4888-8888-888888888888";
const key = "99999999-9999-4999-8999-999999999999";
const fingerprint = "a".repeat(64);
const lineRow = { id: line, purchaseRequestId: source, purchaseRequestLineId: source,
  description: "Office paper", unitCode: "EACH", categoryCode: null, quantity: "1.0001",
  approvedUnitEstimate: "0.0001", estimatedValue: "0.00010001", allocationState: "Reserved" };
const draft = { id: event, number: "RF-10", title: "Office paper", method: "RFQ", currencyCode: "ZMW",
  status: "Draft", version: 3, originalDraftFingerprint: fingerprint, cancellationReason: null,
  canPublish: false, supplierDeliveryState: "NotStarted", financeReservationChanged: false, lines: [lineRow] };
function respond(body: unknown, status = 200) {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetch); return fetch;
}
afterEach(() => vi.unstubAllGlobals());

describe("internal principal RFQ publication", () => {
  it("shows only verified own drafts and current Core assignments", async () => {
    respond(draft); expect((await getPublication(company, event)).lines[0].estimatedValue).toBe("0.00010001");
    const fetch = respond({ items: [{ id: event, number: "RF-10", title: "Office paper", currencyCode: "ZMW",
      status: "PublicationReview", version: 4, originalDraftFingerprint: fingerprint, state: "VerifiedRetainedSourcing" }],
    total: 1, page: 1, pageSize: 25, scope: "OwnCurrentCompany" });
    expect((await listPublications(company)).items[0].status).toBe("PublicationReview");
    expect(fetch.mock.calls[0][1].headers.get("X-Shell-Entity")).toBe(company);
    respond({ items: [{ eventId: event, caseId, number: "RF-10", title: "Office paper", status: "PublicationReview",
      assignments: [{ id: assignment, version: 1, state: "Pending" }], state: "VerifiedAssignedReview" }],
    total: 1, page: 1, pageSize: 25, scope: "CurrentCoreAssignment" });
    expect((await listAssignedPublicationReviews(company)).items[0].state).toBe("VerifiedAssignedReview");
  });
  it("uses the scoped supplier preview and exact source CAS for opening", async () => {
    respond({ eventId: event, eligibilityMeaning: "CurrentApprovedPreviewOnly", items: [
      { supplierId: supplier, displayName: "Approved supplier", number: "SUP-1", bank: "hidden" }],
    total: 1, page: 1, pageSize: 25 });
    expect((await searchPublicationSuppliers(company, event, "paper")).items[0]).toEqual({
      supplierId: supplier, displayName: "Approved supplier", number: "SUP-1" });
    const fetch = respond({ eventId: event, status: "PublicationReview", version: 4, publicationReviewId: source,
      coreCaseId: caseId, coreCaseVersion: 1, supplierDeliveryState: "NotStarted", financeReservationChanged: false, commandKey: key }, 201);
    await openPublicationReview(company, draft as PublicationDetail, [supplier], key);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ expectedEventVersion: 3,
      originalDraftFingerprint: fingerprint, supplierIds: [supplier] });
    expect(fetch.mock.calls[0][1].headers.get("Idempotency-Key")).toBe(key);
  });
  it("pins assigned reviewer versions and validates the original GET result", async () => {
    const review: PublicationDetail = { ...draft, status: "PublicationReview", version: 4,
      lines: [lineRow], invitations: [], publication: { openingId: source, coreCaseId: caseId, caseState: "Pending",
        coreCaseVersion: 1, policyVersionId: source, policyVersionNumber: 1, reviewer: true,
        assignments: [{ id: assignment, version: 1, state: "Pending", permissionKey: "procurement-sourcing-publish" }] } };
    const reply = { eventId: event, status: "Published", version: 5, publicationReviewId: source, coreCaseId: caseId,
      coreCaseVersion: 2, coreDecisionId: line, caseState: "Approved", supplierDeliveryState: "ReadyForManualDelivery",
      financeReservationChanged: false, commandKey: key };
    const fetch = respond(reply);
    await decidePublicationReview(company, review, review.publication!.assignments[0], "Approve", "", key);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ expectedEventVersion: 4,
      expectedCaseVersion: 1, expectedAssignmentVersion: 1, action: "Approve" });
    respond(reply);
    await recoverPublicationCommand(company, { action: "decide", key, eventId: event, targetId: assignment });
    respond({ ...reply, eventId: source });
    await expect(recoverPublicationCommand(company, { action: "decide", key, eventId: event, targetId: assignment })).rejects.toThrow();
    respond({ ...reply, status: "Draft" });
    await expect(recoverPublicationCommand(company, { action: "decide", key, eventId: event, targetId: assignment })).rejects.toThrow();
    respond({ ...reply, coreCaseVersion: 0 });
    await expect(recoverPublicationCommand(company, { action: "decide", key, eventId: event, targetId: assignment })).rejects.toThrow();
  });
  it("locks an uncertain command to its original reference and context", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (name: string) => values.get(name) ?? null,
      setItem: (name: string, value: string) => { values.set(name, value); },
      removeItem: (name: string) => { values.delete(name); } } as Storage;
    const slot = JSON.stringify(["tenant", company, "principal", "branch", event]);
    const reference = { action: "open" as const, key, eventId: event };
    writePublicationRecovery(slot, reference, storage);
    expect(readPublicationRecovery(slot, storage)).toEqual(reference);
    expect(() => writePublicationRecovery(slot, { ...reference, key: source }, storage)).toThrow();
    expect(readPublicationRecovery(JSON.stringify(["tenant", company, "other", "branch", source]), storage)).toBeNull();
    writePublicationRecovery(slot, null, storage);
    expect(readPublicationRecovery(slot, storage)).toBeNull();
  });
});
