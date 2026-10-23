# Procurement screen layout audit

23 October 2026. Source reference: ERP-adapted `d104f596183e7a012a04578a679aac795e1489d4`, raw Greenwebb reference `6f0c305d96edeed6b3a062dbfdbb9521f8d1eebd`. Audit baseline: published UI main `56959531eca92c58ec058a2db7833afee4c67cb5`. Original list/detail/editor templates remain available; preserve later shell, shared controls, branding, scoped APIs, exact values and recovery. This is a source/control audit, not whole-module acceptance or a claim that every screen is visually identical.

| Surface | Finding / history | Next work |
| --- | --- | --- |
| Home | Restored in PR58 / `5eb6380`; original dashboard receives live model | Preserve; spend/reporting data still separate |
| Bills / Inbox | Restored in PR57; full list/editor/detail and upload-panel presentation | Preserve existing API/document/recovery work |
| My Requests / Purchase Requests | Plain table, panel editor/detail replaced original presentation; request backend began `6431342` | This batch restores directory, editor frame/line table and detail tabs, retaining policy review, approvals, submit/withdraw and exact inputs |
| RFQs | `150c1b9`, governed extension `6b7d1cb`; both branches simpler than original list/wizard/detail | This batch restores ad hoc draft directory only; governed source mode and all editors/details need their own parity acceptance |
| Purchase Orders | `6b69b6c`, operational `58aef35`; draft/operational worklists and detail panels simplified | This batch restores draft directory only; preserve operational source conversion, approvals, commitment, issue, dispatch and revisions before adapting those layouts |
| Receiving | `4da2568`, restoration `b6dbf96`; already uses ListTools/shared table, preview, detail tabs and actual receiving/service/inspection actions | Verify remaining gaps; do not replace existing restored work |
| Vendors | Initial `9cbf463`; detail restored `80d13c7`, full editor `42a6994`; directory still reduced | Restore list tools/columns/selection/preview while retaining actual search/status/paging, contacts/sites/qualifications and Core permissions |
| Items | Initial `7ccf524`; employee published catalog is useful additional API branch; buyer item list/detail/editor lack original catalog presentation | Restore buyer presentation and preserve catalog price/activation workflows and employee catalog access |
| Recurring purchases | `d49b132`; simplified list/editor/detail | Restore original organization while retaining schedule/forecast semantics; it does not generate bills or payments |
| Vendor credits | `ea4f7bd`; already substantial list/editor/detail restoration | Preserve real invoice-linked commercial credits; Finance applies/refunds them |
| Contracts / Plans | ERP additions `f97ee4f` / `88e7852`, no original route counterpart | Apply shared presentation conventions; do not claim a removed original feature |
| Budgets | `93daaf7` is an ERP Finance request-review workspace, not the original simulated budget ledger | Preserve actual review/release actions; needs owning budget read model before register/chart integration |
| Analytics | `59e69a0` replaced reports center with four counts | Restore report-directory layout without inventing metrics/export or Finance authority |
| Settings | Directory/rail/search/module tabs retained; `9b56eec` / `fa8143d` connect supported settings | Audit individual children; keep global settings in Core and never enable local preview saves as live configuration |
| Payments / Batch Payments | Legacy local components remain in App routes, but ProcurementLiveGate does not admit these paths in live mode; ordinary live access renders PendingLiveWorkflow | Preserve original presentation for future manual-payment/status adapters. No exposed local-payment mutation was established. Do not bypass the live gate or claim bank execution |

## First restoration batch

The shared LiveRecordDirectory uses the existing imported ListTools, StandardDataTable, preview modal, field filters, column controls and loaded-page selection. Data/paging/actions remain owned by each API adapter. Filters/sorting/selection are explicitly current-page operations; import/export/bulk mutation stay unavailable without their owning contracts. My Requests and buyer Purchase Requests retain distinct titles; no organization-wide authority is inferred from the buyer route.

Request editor keeps every existing field and catalog reference, exact decimal drafts, version checks and uncertain-response locks, adding original form frame, line table, attachment placeholder, sticky action footer and guarded cancel/close. Detail keeps Overview mounted across tabs so approval recovery and entered reasons are retained; root action failures remain visible across tabs. Removes the request detail route's duplicate padding. These changes do not enable P25 or new financial/operational flags.

Scope/context remounts and abort guards must prevent another account/company/branch's rows, preview, selection or draft from surviving an identity change. An employee link is not required. Uncertain writes must not be presented as failed or retried as new commands. Existing durable create/edit/submit recovery gaps remain a separate backend milestone; this UI batch does not certify them.

Independent source review corrected the initial payment-route concern after checking the live gate; static presence of a component is not proof of reachable behavior. Backend/API persistence, visual parity and production publication require separately labelled evidence.

## First batch controlled acceptance

Frozen application source `ee6185c` and final test-only correction `8ee0144998b6f93275a98158dfabb7a215c21cdf`: live TypeScript/production build passed; all 45 focused Playwright cases passed, one worker, zero retries/failures/skips/flaky results. Application and artifact hashes remained unchanged through the final browser run. Desktop/phone request list, editor and detail screenshots were inspected. Cases preserve exact wide/eight-place inputs, policy/approval/readiness controls, return/resubmit, withdrawal, stale/unknown saves, catalog references, scope denials and legacy PO/RFQ CRUD. Added 408/429/499 uncertainty locks and long-title bounds.

Private result `/home/amizo/erp-backups/procurement-request-layout-20261023_run03/result.json`, SHA256 `be45fa3d3aa997a691e5a108a4ca696fd233bf3fe8db54dfe848e0f0294cd06b`. Business HTTP is mocked; this is presentation/client behavior evidence, not fresh real PostgreSQL persistence or production deployment. The initial 41-pass/3-failure run and 44-pass/1-failure run (shell returned143) remain retained. Corrections distinguish denied lists from empty ones, scope the unknown-save status assertion, and use the shared label's actual accessible name. They do not suppress authorization assertions or change server grants.


## Second restoration batch — catalog directories, recurring purchases and Analytics

Restores Vendors and buyer Items directories with the imported toolbar/table, column controls, current-page filters/selection and preview while preserving actual server search/status/paging. Vendor editor/detail and employee published catalog remain intact. Buyer item editor/detail are the next separate batch. Catalog labels distinguish vendor references from registration IDs and describe actual order eligibility.

Recurring purchases now retain the original grouped editor, directory and detail tabs. All existing schedule, owner, branch, version and recovery fields/actions remain connected; these records do not generate bills or execute payments. Exact amount sorting groups currencies before comparing decimal strings without floating-point conversion. Unknown saves stay locked and offer read-only review rather than a misleading discard/retry action.

Analytics reuses the original reports-center presentation with explicit scoped live data. Rows describe only loaded pages; partial read failures are disclosed, pending permitted reads remain Loading, and missing spend/Finance/export contracts remain visibly unavailable. No simulated monetary reporting or demo-store mutations are enabled. Existing Home counts and presentation remain intact. Shared directory improvements are optional adapters, not a second table implementation.

Frozen application `17034ae86d9acb935d97bb447c6f6a677d3d97ab`, final test-only selectors `21910b00236bcf9a9ba4fd3204e0945cd44ade68`: live build and four focused unit tests passed. Three serial Playwright cohorts passed 22 + 37 + 14 = 73 distinct cases, with zero retries, failures, skips or flaky cases. Source and all five staged asset hashes were verified across the cohorts. This is UI/client-contract evidence with mocked business HTTP, not new PostgreSQL or production acceptance. Analytics desktop/phone screenshots were inspected. Earlier syntax/selector failures and an interrupted full run are retained rather than counted as acceptance.

Private acceptance: `/home/amizo/erp-backups/procurement-catalog-analytics-20261023_acceptance/result.json`; SHA256 `9059e9736927f5ff91a205d3ce45bf532a756ea2ae4acd9c598be4cb8282ffd4`. Independent source review covered pending Analytics data, recurring exact sorting, save locks, scope, unsupported actions and field preservation. No backend image, database schema, access grant or feature flag changes are included.


## Third restoration batch — RFQ, purchase orders and item editors/details

Restores both ad hoc and approved-request RFQ editors to the original six-section rail, with working section navigation and truthful unavailable terms/documents/bidding/team controls. Both details retain the original header and tabs. Overview remains mounted so cancellation input/recovery is retained. Governed lists retain actual server search/status/paging and keep unverified records blocked. Account invalidation resets RFQ presentation.

Restores legacy and linked PO editors, their grouped fields and bottom action bar; legacy and operational details retain Overview/Items/Related/Comments/History, including real approval, financial evidence, issue/dispatch history, source links and command recovery. Existing decision/action forms stay outside conditional tab content. The operational list now reuses LiveRecordDirectory while preserving permitted Buyer/Finance/Sending views and server status filtering. Search/column filters/sort/selection are explicitly loaded-page operations. Initial reference sorting is explicit rather than claiming a nonexistent creation date. Shared optional context controls do not replace module-specific worklist responsibilities.

Restores item editor groups and detail profile/sidebar/tabs. All item and supplier-price actions, exact corrections, version checks and uncertainty guards remain. The price editor stays mounted across tabs; new exit controls are disabled during saves. Missing sales/tags/history/related transaction contracts remain explained rather than implemented through demo data. Existing buyer directory and employee catalog branches remain intact.

Browser inspection found a genuine mobile overflow in the linked PO form: fieldset minimum content width forced a roughly770px page into a390px viewport. Explicit min-width0 contains the source table within its own scroll area. Desktop/phone bounds and header hit targets now pass. Root inspected RFQ, item and order screenshots. Tests wait for the ERP startup overlay before capturing visual evidence. A header measurement was corrected to reset form-fill scroll before testing the top-of-page geometry; stale PO Reason selectors were aligned to the existing explicit accessibility label without changing approval behavior.

Acceptance is incremental across two production builds, not a single full-suite run: 57 RFQ/item/legacy-order cases passed on application `69cdbabaa5cf6a5ab026a349be04154801dd2679`; the only later runtime changes are the linked-PO containment fix, operational worklist and optional shared directory presentation slots. On the final application, 40 affected PO cases and nine shared directory consumer cases passed. All other tracked runtime source hashes were verified unchanged. Total:106 distinct cases, zero retries/failures/skips/flaky outcomes in accepted cohorts. Final TypeScript/live build and all five artifact hashes passed verification. Earlier failed builds, the mobile failure, stale selectors and interrupted command/server attempts remain retained and excluded from acceptance.

Private acceptance `/home/amizo/erp-backups/procurement-rfq-orders-item-20261023_acceptance/result.json`; SHA256 `acec48ce0bbf1f92ce35686cd8acfad74d8ee434e507847296309b0eabd79fd8`. Business HTTP is mocked; this is UI/client-contract evidence, not new PostgreSQL persistence or whole-module backend acceptance. API clients, backend image, schema, access grants and capability flags remain unchanged. Public publication is verified separately.

## Remaining boundaries

The major replaced original screens identified above now have restoration work recorded through this third batch. Receiving, vendor full editor/detail, credits and settings already retained substantial imported presentation and must keep their existing controlled adapters. Contracts/plans and the Finance budget-review workspace are ERP additions without an original route counterpart. No claim is made that every original control has a completed server workflow: RFQ bidding/award, unsupported attachments/collaboration/history/export, manual payments and batch operations still need their owning contracts. Payment routes remain gated; restoring presentation does not authorize local payment mutations or invent Finance status.
