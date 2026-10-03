# Procurement UI workflow gap register

**Reviewed:** 3 October 2026 at frontend commit `43eba3f` against `PROC-UX-02-COMPLETE-LOVABLE-UI-PROMPT-PACK.md` and PROC-CFG-01/PROC-01–14 in the ERP documentation repository. W01–W03 were updated and replayed in the browser on 3 October 2026; the remaining rows are the original source review. This is a browser-local frontend, supported by the journeys in [the acceptance review](procurement-ui-gap-review.md). Code presence is not a passed browser scenario.

**Priority:** P0 blocks a complete source-to-pay or authority workflow; P1 is a documented alternate path/control needed for full UI acceptance. **Partial** means a screen exists but the transition or downstream result is incomplete. **Missing** means there is no usable path. **Verify** means the code suggests a path but browser acceptance is outstanding. Backend integration is listed separately.

## Connected baseline

One demo request can split into RFQ, direct PO and contract release, then reach sealed bid, award, PO issue, receipt, invoice match, AP handoff, simulated Finance payment status and PR closure. Supplier onboarding, catalog, planning, contracts, reports, policy and supplier portal have screens. The following gaps remain.

## P0 — workflow continuity and control

| ID / source | Current UI | Missing workflow and acceptance result |
| --- | --- | --- |
| W01 · PROC-02, Prompt 06 | **Browser-verified demo fix:** requester edits returned lines/coding/evidence, sees amount/version change, resubmits as a new version and receives a new approval task. Draft submission creates a task; withdrawal closes it. The seeded Kenya return retains its hard budget and supplier policy failures. | **Remaining:** connect fresh Finance budget/policy evaluations, reservation and authoritative versioned decisions; browser-local history is not durable audit evidence. |
| W02 · PROC-03, Prompt 07 | **Browser-verified demo fix:** named approvers decide independently; first of two required decisions leaves the task open, second completes it, and the unused third approver is skipped with timestamps. | **Remaining:** configure policy-owned quorum/rejection rules and persistent role identity/approval audit. |
| W03 · PROC-03, Prompt 07 | **Browser-verified demo fix:** an approval can be delegated to a named same-entity actor, who sees it in Delegated and can approve it. The original actor no longer matches the pending assignment; date and amount are checked. | **Remaining:** use real identity and delegated authority records; test expired date/limit and direct URL under production authorization. |
| W04 · PROC-03/CFG-01, Prompt 07 | Hard budget block and seeded exception display exist; new PR tasks use advisory check and illustrative unlimited authority. | **Missing:** exception request → named Finance/budget decision → reservation reference → recheck/reapproval; show denial, outage, expiry and release without inventing funds. |
| W05 · PROC-02, Prompt 06 | Buyer allocates approved lines, but cancellation/recovery and conflicting conversion are incomplete. | **Partial:** split line quantities across routes, cancel/defer unused balance with reason, release failed draft allocation, and handle stale/concurrent conversion without duplicate order. |
| W06 · PROC-06, Prompt 09 | Evaluation has a score per bid; multi-item award is blocked from PO conversion. | **Partial:** individual evaluator score history/conflict exclusion, line-level full or partial award, remaining quantity and separate award approval; create each awarded PO/contract. |
| W07 · PROC-06, Prompt 09 | No-award result exists; value/currency blocks are partial. | **Partial:** reroute unawarded source lines, record currency basis, show exact above-balance line and authorized reapproval path. |
| W08 · PROC-08, Prompt 11 | `Order` supports one line and due date; revision and blanket controls exist. | **Partial:** multi-line PO/schedules, line source links and balances, material revision reapproval, duplicate dispatch/unknown send, partial cancellation and remaining commitment release. |
| W09 · PROC-09, Prompt 12 | Receipt acceptance/rejection, reversal and return request exist for one PO line. | **Partial:** return → supplier response → replacement/credit → closure; conditional inspection/service dispute; rejected/reversed quantity drives rematch and PR balance. |
| W10 · PROC-11, Prompt 14 | Invoice match reads current PO/receipts; correction and demo AP callbacks exist. | **Partial:** line-level PO/receipt/invoice comparison with tax/tolerance/source version; PO, receipt, credit or variance resolution; rerun match; AP rejection and unknown/conflicting callback recovery. |

## P1 — alternate paths, evidence and operational UX

| ID / source | Current UI | Missing workflow and acceptance result |
| --- | --- | --- |
| W11 · PROC-00/CFG-01, Prompts 01/17 | Getting Started stores a per-entity “reviewed” marker; some Configuration cards are previews. | **Partial:** readiness reflects actual policy, roles, suppliers, items, Finance connector and first transaction, with owner/state. Reviewing guidance never activates a capability. |
| W12 · PROC-02/04, Prompts 02/03 | Guided request and catalog work; evidence is a text reference. | **Partial:** file selection/progress/failure/retry, budget unavailable state, restriction/contract fallback and expired/multiple-offer decisions across entities. |
| W13 · PROC-01, Prompt 04 | Supplier review/activation works locally; document attachment is a demo reference; suspension lists affected counts. | **Partial:** document retry, qualification expiry task, per-record PO/invoice impact decisions, conditional expiry/reactivation and Finance verification rejection. |
| W14 · PROC-13, Prompt 04 | Supplier performance tab shows seeded scores or insufficient data. | **Missing:** reproducible period/source scorecard, disputed metric, corrective plan, approval and score history; low score never auto-suspends. |
| W15 · PROC-05, Prompt 05 | Planning has versions and linked PR. | **Verify:** all roles' submit/review/revise/close, changed estimate, missing funding, cancelled line and frozen prior version; linked PR keeps plan source/coding. |
| W16 · PROC-06, Prompt 08 | Sourcing wizard/detail has invitations, Q&A display, amendments, sealed bids and surrogate entry. | **Partial:** edit/return/reopen draft, answer/publish Q&A, failed invitation and resend result, no-response closure/reroute, amendment delivery outcome. |
| W17 · PROC-06, Prompts 08/09 | Surrogate bid keeps channel/time/evidence reference. | **Partial:** evidence file failure, controlled correction/version, late-bid decision, opening quorum and evaluator withdrawal. |
| W18 · PROC-07, Prompt 10 | Contract detail has signature reference, ceiling and framework release. | **Partial:** standalone draft/edit, signed terms/rate comparison, pending signature, renewal decision, old signed version, termination impact and over-ceiling amendment. |
| W19 · PROC-07, Prompt 10 | Recurring commitments are described in contracts. | **Partial:** frequency, cycle dates, owner, missed-cycle, renewal and closure UI. Finance owns recurring bills. |
| W20 · PROC-08, Prompt 11 | PO issue/acknowledgment/revision/closure actions exist. | **Verify:** above/below-materiality revision, supplier rejection, expiry, blanket limit, partial cancellation and closure; source and financial balances agree. |
| W21 · PROC-09, Prompt 12 | Goods receipt has inspection/evidence reference; service acceptance has period/deliverable. | **Partial:** lot/serial/photo, checklist/conditional acceptance, service dispute, and Inventory/Asset handoff pending/accepted/rejected. |
| W22 · PROC-10, Prompt 13 | Manual/portal invoice intake, duplicate check, correction and credit reference exist. | **Partial:** unreadable/failed upload/retry, unknown supplier/wrong entity routing, tax/total validation, cancelled-service credit and Finance-confirmed refund/application. |
| W23 · PROC-11, Prompt 14 | Handoff key/attempt count and demo callbacks appear. | **Partial:** operator queue for pending/unknown/failed, reconciliation by key, safe retry, AP correction owner and stale/conflicting callback history. |
| W24 · PROC-12, Prompt 15 | Supplier portal shows own RFx, PO, invoice, profile/evidence, credit and messages. | **Partial:** actual scoped upload and retry, expired invitation, duplicate submission retry, suspended supplier, unassigned supplier user and last Finance confirmation timestamp. |
| W25 · PROC-14, Prompt 16 | Scoped demo measures/CSV and selected timelines/comments exist. | **Partial:** saved URL filters, as-of/source freshness, spend/savings definitions, off-contract case workflow, full transaction-chain audit, permissioned audit export and comment audience on every record. |
| W26 · PROC-CFG-01, Prompt 17 | Policy studio has draft/review/publish/simulation locally. | **Verify/partial:** effective-date collision, gaps/precedence, missing authority/Finance sign-off, future publication, successor/retirement impact and transaction policy-version explanation. |
| W27 · shared UI, Prompt 18 | Main routes and grouped mobile menu passed phone-width checks. | **Missing acceptance pass:** tablet and keyboard audit, focus/dialog recovery, table alternatives, reduced motion, unsaved draft, stale edit, upload failure and accessible errors. |
| W28 · PROC-00/14, Prompts 01/16 | Home cards and search exist; some card values assume seeded Netherlands requester data. | **Partial:** each card opens its matching scoped queue, including Kenya employee requests; search/notifications use current records, not static examples. |

## Integration-owned interfaces to design

| Owner | States Procurement UI must show | Boundary |
| --- | --- | --- |
| HRMS / Identity | Inactive employee, manager move, delegated authority change, delayed sync | Read workforce references; preserve historic actors. |
| Finance / Budgets | Hard failure, check unavailable, reservation pending/confirmed/rejected, release | Finance owns available balance and commitment. |
| Finance / AP / Treasury | Handoff unknown/rejected/posted, partial/paid, credit applied/refund confirmed | Finance owns recurring bills, batch payments, payment methods and execution. |
| Documents / Notifications | Upload/scanning/retry, supplier invitation delivery failure, reminder resend | Shared services own files and delivery. |
| Inventory / Assets | Goods handoff pending/accepted/rejected, return adjustment, asset reference | These modules own stock and asset records. |
| Shared audit / integration | Idempotent retry, dead letter/reconciliation, audit export/access log | Browser storage cannot enforce durable audit or tenant isolation. |

## UI completion order

Most gaps should be finished inside existing record pages instead of adding more sidebar links:

| Existing area | UI component to add or finish |
| --- | --- |
| My Requests / Purchase Requests | Returned-request editor, version comparison, line split/remainder and conflict recovery panel. |
| Approvals / Budgets | Per-person decision panel, quorum tracker, delegate inbox and budget exception case. |
| Requests for Quotes / Evaluations | Draft editor, invitation delivery and Q&A, evaluator score sheets, line award allocation and no-award reroute. |
| Contracts / Purchase Orders | Contract authoring and renewal decision, multi-line PO schedule, revision approval and dispatch result. |
| Purchase Receipts | Inspection detail, service dispute, return/replacement/credit tracker and handoff status. |
| Payables / Bills | Line comparison, exception resolution workbench, AP reconciliation queue and callback history. |
| Vendors / Supplier portal | Document upload/retry, qualification and impact review, performance scorecard/corrective plan. |
| Analytics / Configuration | Audit-chain view, saved filters, source freshness, policy impact/conflict and setup readiness. |

1. W01–W05: returned requests, independent approval/quorum, delegation, budget exception and line recovery.
2. W06–W08 and W16–W20: sourcing award, contract and PO source/quantity/version integrity.
3. W09–W10 and W21–W24: receiving, returns, invoice exceptions and Finance handoff recovery.
4. W11–W15 and W25–W28: first use, supplier/risk, governance, reporting, accessibility and final Prompt 19 replay.

For every row, acceptance evidence must show role and source record, allowed and blocked action, resulting state/quantity, next owner, evidence/timeline, refresh persistence, direct-URL scope, mobile/keyboard result and a negative-path replay. A polished screen alone remains **Partial**.
