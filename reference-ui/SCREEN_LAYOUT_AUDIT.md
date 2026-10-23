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
