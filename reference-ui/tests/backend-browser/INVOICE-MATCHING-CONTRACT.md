# Actual P26 blocked-comparison browser fixture contract

Status: proposed/source only; root review and backend fixture implementation required. No SDK, Node, DB, browser or production job run for this milestone. Builds already verified for invoice application remain retained; this adds transport test/docs only.

## Source audit and minimal dependencies

Backend `/home/amizo/procurement-invoice-comparison-execution`, `tools/ApprovalHttpPostgresProbe/Program.cs`: current argument guard rejects `--serve --matching`; `PrepareBrowserFixture` has no matching branch. Existing receiving browser preparation narrows buyer/Finance actors to receipt-reader roles, so matching preparation must be a separate branch rather than invoking that role reassignment. Preserve all existing CLI modes and mutually exclusive combinations.

`InvoiceMatchingVerification.VerifyUnavailableInvoiceMatching` is a nonserve exercise that already creates invoice/mapping/comparisons and uses empty document version/reference. It is not untouched browser bootstrap and cannot prove the current UI's real document-selection contract. Reuse approved source/policy helpers only, not seeded invoice/match outcomes or a fabricated document.

Bootstrap one actual goods PO and accepted receipt through mapped PR approval, Finance confirmation, PO approval/issue/delivery and P25 record/independent inspection/acceptance; retain exact issued IDs/hash, supplier/currency/branch, authorized/accepted1 at net100. Publish effective INVOICE_MATCHING rules through existing independent governed configuration API, ThreeWay/Goods/IT/ZMW, moneyScale2, exact tolerances. No hardcoded production policy is introduced by a synthetic fixture. Do not execute the full P25 destructive/denial rehearsal to manufacture unrelated history for this browser.

Prepare dedicated current canonical users with finite roles AFTER source bootstrap. Do not reuse erp_admin for browser business calls:

| Actor | Exact permission set | Branch |
|---|---|---|
| mapper | procurement-access, procurement-invoice-read, procurement-invoice-capture, procurement-invoice-match, procurement-vendor-read | fixture branch |
| matcher | procurement-access, procurement-invoice-read, procurement-invoice-match | fixture branch |
| reader | procurement-access, procurement-invoice-read | fixture branch |
| otherBranchMatcher | same as matcher | different actual branch |

None receives PO-read, receipt-view, policy-edit/publish, AP/payment or Finance-owner access. Vendor-read is justified only by the existing capture form's named vendor selector; comparison/source selectors require no broad lookup. All accounts link to active actual canonical workers; create explicit Core branch memberships with owner-only fixture setup. Preserve actual point-of-use checks.

## Real Core document boundary

Root approved a TEST-ONLY KnownFixtureOnlyDocumentScanner: accept exactly the generated harmless PDF byte sequence and expected SHA; reject every other byte/hash/size. Label Engine/Definitions as synthetic exact-fixture only, never as malware protection or verified original units. Keep production Clamd registration/release gates unchanged. Do not replace `IInvoiceMappingEvidenceReviewer` or `IInvoiceHistoricalExposureOwner`; both remain actual unavailable owners.

Enable existing CoreDocuments service on the SAME guarded disposable physical PostgreSQL database as Procurement (server/port/database exact owner-binding contract), a new owner-private blob directory and the approved test scanner replacement inside the tools fixture only. Owner applies existing Core document P01/P02 migrations with its own `core_document.__EFMigrationsHistory` and validates schema; runtime cannot migrate/create/alter/own. Reuse existing DocumentDbContext, RecordDocumentService, EfDocumentRecords, PrivateDocumentStore, owner authorization and invoice document routes. Never manually mark metadata Available.

Extend finite runtime provisioning only for required existing Core document tables: schema USAGE; history SELECT; documents SELECT/INSERT (no retire update unless exercised/needed); versions SELECT/INSERT plus only lifecycle/concurrency UPDATE columns actually used; scan_evidence and record_events SELECT/INSERT, no UPDATE/DELETE. Derive exact quoted physical columns from the Core model, not guessed snake_case. Keep runtime no DDL, role membership, ownership, privileged HRM writes, schema-wide writes or broad Finance grants. Verify denied protected writes remain denied. Scanner may read only staged bytes/private fixture storage, not production directories or network endpoints. Owner checks metadata/bytes/hash and real append-only scan events on shutdown.

The initial manifest cannot contain a version bound to a not-yet-created invoice. It declares only the generated file name/content/hash, scanner test boundary and expected unit/reference. The UI uploads that file against its newly captured actual invoice. Document/version IDs are captured from the actual upload response, then selected from actual owned document GET. Final traffic/completion evidence may expose those IDs after the real owner pipeline; never pre-seed a fake Available row or make up a document ID.

## Proposed minimal private manifest

Extend the existing owner-private manifest with `matching`; no secrets/connection strings/tokens. Existing top-level baseUrl(loopback HTTP only), tenantId=probe, companyId, branchId, currencyCode=ZMW, authenticationHeader=X-Probe-User and actors[].principalId/context remain. Each matching actor also has its assigned branchId.

```ts
matching: {
  source: { orderId, orderNumber, issuedVersionId, purchaseOrderLineId, description,
    supplierId, supplierName, unitCode, categoryCode:"IT", currencyCode:"ZMW",
    receiptLineId, receiptReference, acceptedQuantity:"1", acceptedNetAmount:"100" },
  policyVersionId,
  invoice: { number, date:"2026-10-20", description:"P26 original goods invoice",
    quantity:"1", unitPrice:"100", taxAmount:"0" },
  document: { fileName:"matching-original.pdf", mediaType:"application/pdf",
    contentUtf8, sha256, invoiceUnitCode, lineReference:"Page 1 line 1",
    scannerBoundary:"KnownFixtureOnlyDocumentScanner" },
  noInvoiceOrMatchingRowsSeeded:true,
  originalUnitReviewer:"Unavailable", historicalExposureOwner:"Unavailable",
  noFinanceAuthority:true
}
```

Source/acceptance IDs are hints matched against actual selectors; test cannot inject them as fabricated successful responses. Initial owner snapshot asserts no invoices/original lines/mappings/results/exceptions/claims/Finance handoffs/payments/documents for this scenario and snapshots source accepted counters/effects. All initial source references and configured rules must resolve exactly; unavailable evidence causes fixture failure, not guessed0.

## Browser transport and serial scenarios

Use a new config extending the invoice staged preview at3041, changing only testDir/testMatch/output. It starts no API/DB/build and reads the retained invoice bundle. Two serial cases each retain existing180-second case budget,30-second UI assertions and45-second forwarding timeout, one worker, no retries. Fresh private fixture required; serial state and owner checks reject reused/partial fixtures.

Only ERP shell presentation/auth identity bridge is synthetic, exactly as receiving. Forward ALL `/api/procurement/**` responses (context/meta/vendors/intake/documents/selectors/commands/recovery/history/readiness) to actual private API with current actor and selected company/branch headers. No business route fulfillment is invented. Record each actual status/body/key/response immediately to0600 traffic evidence. Binary download records hash/byte count rather than leaking arbitrary bytes. Do not use a broad permission to rescue a failed purpose selector.

1. **Capture, owned checked document and Unverified mapping:** mapper visits existing Bills/new, chooses actual named vendor, records known representable1×100/tax0 invoice through actual intake. Original ID/line ID/version come from API. Upload generated PDF through actual document component; require Available, actual owner/version/hash and list/download SHA consistency. Link the exact named issued source and accepted receipt through real purpose selectors; use document version from actual list, original unit and line reference. Save one mapping and assert Unverified, version advanced, no comparison POST occurred. Immutable mapping must contain these exact IDs.
2. **Explicit blocked comparison and original-key recovery:** narrower matcher visits same Bills detail; capture/link save absent, explicit compare present from current mapping pointer. Forward first compare POST to real API, record200, deliberately abort only the downstream browser response AFTER upstream completed to exercise ambiguous transport; do not alter its business result. UI must offer only Check saved invoice action; one POST total, no automatic retry. GET recovery by same original key/operation returns actual historical receipt, no current replay/AP authority. Refresh shows one saved Blocked result with CompleteConsumptionEvidenceRequired, never approved/posted/paid. Reader/foreign-branch direct selector/compare/recovery denials prove actual permissions and current scope. GET history/readiness must omit other-invoice allocation/private owner payloads and remain nonauthoritative.

Missing complete consumption returns early in current foundation. Therefore require that actual missing-consumption discrepancy and Unverified mapping; do not fabricate a unit-specific discrepancy from code that did not execute. Do not implement fake verified units or complete zero exposure to reach a passing comparison.

## Independent persisted verifier on graceful shutdown

Proposed fixture flag `PROCUREMENT_MATCHING_BROWSER_VERIFY_ON_STOP=1`. Owner uses NEW independent scoped contexts after browser traffic stops, finding the invoice by exact manifest number+supplier/entity, not trusting browser supplied IDs. Verify:

- One scenario Received invoice, one unchanged original line quantity1/rate100/tax0, original number/date/supplier/branch, no FinancePostingRef and no ActiveMatchClaimResultId.
- One real Core document owner tuple procurement/supplier_invoice/actual invoice ID; one Available version1 with expected immutable hash/length/file metadata/private bytes. Real upload/scan lifecycle events and one test-engine clean scan evidence, actor/scope correct; no manually seeded status. One linked Procurement attachment reference.
- Exactly one immutable mapping (original digest recomputed, correct policy/source IDs, actual original line/document version/unit/reference, actor mapper canonical identity, VerificationState Unverified) and current pointer/revision. Exact owner document version hash must agree with mapping-side evidence; UI input does not make it verified.
- Exactly one immutable result OutcomeBlocked, correct original/mapping/issued/policy hashes/current-source binding and matcher actor, discrepancy CompleteConsumptionEvidenceRequired, one actor-owned InvoiceCompare receipt plus one InvoiceMapping receipt, correct original command keys/fingerprints/advanced versions. Recovery adds no result/receipt.
- Owned Open invoice exceptions match actual result discrepancies and current matcher identity. Audit records for created/updated invoice/mapping/result/exception/receipt and one supplier_invoice.compared.v1 transactional outbox event reference the exact aggregate/key. Derive expected audit set from actually owned records; do not hardcode total database counts polluted by source bootstrap.
- Zero scenario match allocations/held claims, no complete authenticated exposure evidence/owner lease; any created comparison exposure state remains Unknown with no fabricated owner. No invoice validation/AP handoff/payment/ledger records, messages implying posting, Inventory/Asset mutation, or approval authority. Compare/read/recovery leave source receipt effects and PR/PO accepted counters unchanged from trusted bootstrap snapshot.
- Before/after read-only footprint unchanged for selectors/history/readiness/recovery (invoice version/evidence, source counters/effects, claims, exceptions, receipts, audit, outbox, document lifecycle apart from an explicitly tested authorized download event). Completion failure is terminal even if browser assertions pass.

## Required implementation order and release limits

Root reviews this proposed contract → backend author adds only tools fixture/finite CoreDocs setup while model stable → centralized P26 compile/domain/model/migration/actual restricted PG gates → fresh owner-private serve fixture → frontend actual two-case browser gate against frozen invoice assets → independent owner verifier → integration review. No production mutation, deployment, shared-host release-hold bypass or qualified Finance/approval completion claim. PR34 remains draft; issues27/30 and releasehold29 stay open until their actual gates are met.
