# Actual governed RFQ browser acceptance

Status: source authored, unrun. Tests/config/docs only, based on application candidate
`da00853`; no application, layout, permission, financial parser or bundle modification.

## Owned fixture and operator contract

The parent supplies a fresh owner-private manifest from the existing backend
`ApprovalHttpPostgresProbe --serve --rfq`. This frontend test starts no backend or
PostgreSQL. All owner setup must use the reviewed backend fixture, actual committed
P28 migrations and finite runtime grants; no schema/readiness mocks or seeded RFQ
operations. Existing synthetic declared manual Finance evidence is not an external
Finance verification. The source PR is genuinely submitted/funded/Core-approved.

Manifest common fields follow the existing actual Budget convention:
`baseUrl` (only http://127.0.0.1:<port>/), `tenantId=probe`, `companyId`, `branchId`,
`currencyCode=ZMW`, `authenticationHeader=X-Probe-User`, `actors.buyer.principalId`
and the buyer's real `context`. The buyer has only Procurement access, sourcing
convert and sourcing cancel. No legacy sourcing-read, broad PO/request read, settings
or approval grant is required by the existing governed UI.

The `rfq` member contains:

| Field | Required fixture value / meaning |
|---|---|
| requestId / lineId | Actual approved source IDs |
| requestVersion | Current safe integer PR operational CAS |
| requestNumber | Real source number, used to select its UI row |
| purpose | `Browser governed competitive RFQ source` |
| currencyCode | `ZMW` |
| approvedQuantity | Exact string `0.0002` |
| unitEstimate | Exact string `0.0001` |
| selectedQuantity | Exact string `0.0001` |
| expectedEstimatedValue | Exact string `0.00000001` |
| minimumQuoteCount | Explicit published voluntary rule `0` |
| methodCode | Real active method `COMPETITIVE` |
| buyerPrincipalId | Actual finite buyer account, same as actors.buyer |
| title | `Browser exact governed RFQ draft` |
| cancellationReason | `Browser source no longer needed` |

No RFQ event, evidence, binding, allocation or command receipt may be preseeded.
The backend owner verifier must agree with these fields; an incompatible manifest
fails rather than guessing source/policy identity.

## Browser scenario and evidence

One case uses the existing RFQ page only:

1. Real context/meta/picker traffic reaches the API with selected company and branch.
   Validate actual approved source quantity, policy quote count and request CAS.
2. Choose the source and explicitly change its default full quantity to partial
   `0.0001`. Fill the supplied title. Merely browsing/selecting sends zero POSTs.
3. One explicit Create sends exact decimal string quantity, current CAS and UUID.
   Require real201, retained fingerprint and false publication/Finance-effect fields.
4. Actual detail JSON must contain the original `estimatedValue:"1E-08"` G29 string.
   Existing UI must display exact decimal quantity and approved unit estimate, both
   `0.0001`. It does not currently render the derived line product; this test makes
   no claim otherwise. The tested exact projection client normalizes that product.
5. Navigate to the existing owned list, find actual saved number/title, reopen the
   same retained event. These are real GETs, not a second Create.
6. Explicit Cancel sends one new UUID and exact retained fingerprint/current version.
   Forward it to the actual API. After the real200 arrives, retain its full response
   and abort only the browser-facing transport. No server result is fabricated.
7. UI must enter uncertainty, keep the original operation key and offer GET-only
   checking. One explicit Check calls the original Cancel receipt GET; require200,
   historical response bytes exactly equal to the real Cancel response.
8. Actual detail reload shows Cancelled/Released; no further Cancel/Publish/Award/Pay
   button or POST. Exactly two non-GET Procurement requests total: Create and Cancel.

Every `/api/procurement/` request, including context/meta, is routed with
`route.fetch(maxRetries:0)` to the real finite-runtime API. Raw status/body/key/query
are retained. Only ERP shell authentication/branding/organisation presentation is
synthetic; actual Procurement authorization and state are never mocked. The sole
intentional transport fault is post-commit Cancel response loss.

The test writes `actual-rfq-api-traffic.json` owner-readable0600 in its protected
Playwright output and attaches it. Parent retains the fresh private evidence folder,
trace, screenshots and logs under0700. Traffic contains synthetic records only.

## Serialized later run (not executed here)

Use `reference-ui/playwright.rfq-backend.config.ts`, one worker, retries0/maxFailures1,
180s per case. It uses loopback3046 and this **new worktree's**
`.rfq-verification-dist`; do not overwrite frozen Budget or old RFQ bundles.
Parent may provide a reviewed copy/link of the exact verified `da00853` application
assets because this branch changes tests/config/docs only. Record the source SHA,
JS/CSS filenames and full bundle digests before running. No optional rebuild is needed
solely for test changes. Parent must check3046 is free and use its serialized resource
slot, cached Node22, heap512 and nice10.

Provide `PROCUREMENT_APPROVAL_BROWSER_MANIFEST` pointing to the freshly generated
private backend manifest. Run the dedicated Playwright config only. On failure retain
first evidence and stop; correct actual source/test defects before a targeted rerun.
Do not mutate the fixture to add extra events or count retries as a fresh scenario.

After browser terminal success, parent stops the backend and invokes its existing
opt-in independent owner verifier. It must prove exactly one Create + one Cancel
receipt, one retained cancelled event/evidence/binding/released allocation, zero
active holds, conserved original source counters/quantity, unchanged immutable PR,
Finance and Core evidence, and no PO/receipt/invoice/Finance/stock effects. Browser
traffic alone is not independent persisted owner proof. No production deployment,
production capability enablement or award-to-PO readiness is implied.
