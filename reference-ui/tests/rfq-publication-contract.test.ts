import { afterEach, describe, expect, it, vi } from "vitest";
import { createManualQuote, decidePublicationReview, getPublication, listAssignedPublicationReviews,
  listPublications, openPublicationReview, quoteInput, recordManualContact, recoverPublicationCommand,
  searchPublicationSuppliers, type PublicationDetail } from "../../src/platform/procurement-sourcing-publication-api";

const company = "11111111-1111-4111-8111-111111111111";
const event = "22222222-2222-4222-8222-222222222222";
const source = "33333333-3333-4333-8333-333333333333";
const line = "44444444-4444-4444-8444-444444444444";
const supplier = "55555555-5555-4555-8555-555555555555";
const invitation = "66666666-6666-4666-8666-666666666666";
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

describe("principal RFQ publication adapter", () => {
  it("keeps original principal Draft and exact source values while reading verified publication list", async () => {
    respond(draft); const detail = await getPublication(company, event);
    expect(detail.lines[0].estimatedValue).toBe("0.00010001");
    const fetch = respond({ items: [{ id: event, number: "RF-10", title: "Office paper", currencyCode: "ZMW",
      status: "PublicationReview", version: 4, originalDraftFingerprint: fingerprint, state: "VerifiedRetainedSourcing" }],
    total: 1, page: 1, pageSize: 25, scope: "OwnCurrentCompany", canPublish: false });
    expect((await listPublications(company)).items[0].status).toBe("PublicationReview");
    expect(fetch.mock.calls[0][0]).toContain("/principal-publications?page=1&pageSize=25");
    expect(fetch.mock.calls[0][1].headers.get("X-Shell-Entity")).toBe(company);
    respond({ items: [{ id: event, number: "RF-10", state: "Unavailable", title: "Private" }],
      total: 1, page: 1, pageSize: 25, scope: "OwnCurrentCompany" });
    expect((await listPublications(company)).items[0]).not.toHaveProperty("title");
  });
  it("reads only assigned current review and minimal approved supplier lookup", async () => {
    respond({ items: [{ eventId: event, caseId, number: "RF-10", title: "Office paper", currencyCode: "ZMW",
      status: "PublicationReview", eventVersion: 4, caseVersion: 1,
      assignments: [{ id: assignment, version: 1, state: "Pending" }], state: "VerifiedAssignedReview" }],
    total: 1, page: 1, pageSize: 25, scope: "CurrentCoreAssignment" });
    expect((await listAssignedPublicationReviews(company)).items[0].state).toBe("VerifiedAssignedReview");
    const fetch = respond({ eventId: event, eligibilityMeaning: "CurrentApprovedPreviewOnly", items: [
      { supplierId: supplier, displayName: "Approved supplier", number: "SUP-1", privateBank: "do-not-copy" }],
    total: 1, page: 1, pageSize: 25 });
    expect((await searchPublicationSuppliers(company, event, "paper")).items[0]).toEqual({
      supplierId: supplier, displayName: "Approved supplier", number: "SUP-1" });
    expect(fetch.mock.calls[0][0]).toContain("/principal-publication-suppliers?q=paper&page=1");
  });
  it("pins publication opening and independent reviewer CAS to one explicit key", async () => {
    const detail = draft as PublicationDetail;
    let fetch = respond({ eventId: event, status: "PublicationReview", version: 4, publicationReviewId: source,
      coreCaseId: caseId, supplierDeliveryState: "NotStarted", financeReservationChanged: false, commandKey: key });
    await openPublicationReview(company, detail, [supplier], key);
    expect(fetch.mock.calls[0][1].headers.get("Idempotency-Key")).toBe(key);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ expectedEventVersion: 3,
      originalDraftFingerprint: fingerprint, supplierIds: [supplier] });
    const review: PublicationDetail = { ...detail, status: "PublicationReview", version: 4,
      publication: { openingId: source, coreCaseId: caseId, caseState: "Pending", coreCaseVersion: 1,
        policyVersionId: source, policyVersionNumber: 1, supplierDeliveryState: "PerInvitation", reviewer: true,
        assignments: [{ id: assignment, version: 1, state: "Pending", permissionKey: "procurement-sourcing-publish" }] } };
    fetch = respond({ eventId: event, status: "Published", version: 5, coreCaseVersion: 2, coreDecisionId: source,
      caseState: "Approved", supplierDeliveryState: "ReadyForManualDelivery", financeReservationChanged: false, commandKey: key });
    await decidePublicationReview(company, review, review.publication!.assignments[0], "Approve", "", key);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ expectedEventVersion: 4,
      expectedCaseVersion: 1, expectedAssignmentVersion: 1, action: "Approve" });
  });
  it("treats contact as external evidence and quote as internal Draft, never supplier submission", async () => {
    let fetch = respond({ eventId: event, invitationId: invitation, status: "ManualContactRecorded",
      supplierDeliveryReported: true, emailSentBySystem: false, commandKey: key });
    await recordManualContact(company, event, { id: invitation, supplierId: supplier,
      status: "ReadyForManualDelivery", version: 1, contactRecorded: false },
    "EmailOutsideSystem", "external-log-1", "2026-10-23T12:00:00Z", key);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ channel: "EmailOutsideSystem",
      reference: "external-log-1", reportedContactAt: "2026-10-23T12:00:00Z" });
    const quote = { eventId: event, bidId: source, supplierId: supplier, invitationId: invitation,
      status: "Draft", bidVersion: 1, draftRevision: 1, sourceChannel: "Manual", supplierSubmitted: false,
      totalExact: "0.00010001", commandKey: key, lines: [{ sourcingLineId: line, quantityExact: "1.0001",
        unitPriceExact: "0.0001", taxAmountExact: "0", deliveryAmountExact: "0" }] };
    fetch = respond(quote, 201);
    await createManualQuote(company, event, invitation, [{ sourcingLineId: line, quantity: "1.0001",
      unitPrice: "0.0001", taxAmount: "0", deliveryAmount: "0" }], key);
    expect(fetch.mock.calls[0][0]).toContain("/principal-manual-quotes");
    expect(JSON.parse(fetch.mock.calls[0][1].body).lines[0].unitPrice).toBe("0.0001");
    expect(() => quoteInput([{ sourcingLineId: line, quantity: "0.00001", unitPrice: "1",
      taxAmount: "0", deliveryAmount: "0" }])).toThrow();
    fetch = respond(quote);
    await recoverPublicationCommand(company, { type: "quote", action: "quote-create", key, eventId: event });
    expect(fetch.mock.calls[0][0]).toContain(`/principal-manual-quote-commands/${key}`);
    expect(fetch.mock.calls[0][1].method).toBe("GET");
  });
});
