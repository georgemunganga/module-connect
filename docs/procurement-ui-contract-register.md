# Procurement UI and API contract register

**Status:** working UI blueprint, updated 18 October 2026. The Procurement screens use local demonstration data in demo mode. Both UI entry points check the ERP session, company, and Procurement schema readiness in live mode. The reference workspace now has a scoped live adapter for **vendor drafts only**; all other transaction screens remain held. Source migrations now define commercial and operational records, but they have not been applied to production. This register does not authorize spending, supplier activation, budget reservation, AP posting, or payment.

The ERP feature specifications in `newworld-erp/docs/procurement/PROC-00` through `PROC-14` own business rules. `GW-ENG-STD-001` is the Tier 3 engineering standard for this ERP programme, and `PROC-BE-05` maps the new schema to live integration gates. The [workflow gap register](procurement-ui-workflow-gap-register.md) records incomplete interactions. Each row below should be checked against the 28-section child-feature document before its live adapter is enabled.

## Common contract for every record screen

| Concern | UI requirement | API/source owner |
| --- | --- | --- |
| Identity and scope | Use verified `tenantId`, `legalEntityId`, `workerId`, permissions, allowed company and `company.currencyCode` from `/api/procurement/v1/context`. Pre-fill the selected company's currency on new drafts; preserve each saved transaction's currency on edit. Display labels may change; use stable IDs in requests. | Core supplies the selected company and default currency. HRMS/shared host validates active worker, company, role and record scope on every request. |
| Identity on a decision | Show actor, assigned role, delegation and effective authority. Never send a free-text approver name as authorization. | Shared workflow and identity services. |
| Version | Send server version on edits and transitions. On conflict, offer refresh and compare; preserve unsaved form input. | Procurement API optimistic concurrency. |
| State | Show current state, next owner, permitted transitions and reason requirements. Keep receipt, invoice, AP and payment progress separate. | Record-owning service returns authoritative state and actions. |
| Amount | Keep amount, currency, tax basis and source line together. Label estimates; show Finance confirmation only when a Finance reference exists. | Procurement commercial record plus Finance budget/AP reference. |
| Evidence | File name is not an uploaded document. Show upload, scan, failure, retry, version and permission state. | Shared document service. |
| Audit | Show the returned event ID, actor, timestamp, policy/version, reason and linked record. Browser history is illustrative only. | Shared immutable audit and integration logs. |
| Failure | Handle validation, forbidden/not found, stale version, dependency unavailable, pending/unknown outcome, duplicate request and retry by idempotency key. | Owning API and integration queue. |

## Screen and action map

`Draft API` means an endpoint exists in source, subject to migration and deployment. `Demo` means the visible workflow has browser-local state only. No row below is a live-release claim.

| Screen | Visible decision or action | Source contract today | Contract needed before live use |
| --- | --- | --- | --- |
| Getting started / Settings | Review policy, people, vendors, items and Finance connection | Demo; category/method draft APIs exist in source under `/api/procurement/v1/configuration` | Server setup status per company with owner, validation, effective date and dependency health. Review ticks stay separate from readiness. Published procurement policies and UI settings adapters are still pending. |
| Items / Catalog | Maintain item, unpublished offer, search approved catalog | Draft API: `/api/procurement/v1/items`, `/catalog` | Item publish/eligibility decision, supplier-backed offer and audience/site rules; only published entries enter employee catalog. |
| Vendors | List/create/edit/withdraw draft; add contact and address | Draft API: `/api/procurement/v1/vendors`; live workspace adapter and Playwright flow implemented in source | Qualification/document UI, diligence, independent Finance verification, activation/suspension and supplier portal identity; `status` and `isOrderable` remain separate. Production access still requires migration and release gates. |
| My Requests | Create/edit/withdraw draft with lines | Draft API: `/api/procurement/v1/requests` | Submit, policy and Finance budget result, approvals, line allocation, cancellation and close. Each line needs stable ID and quantities for approved, allocated, ordered, accepted and cancelled. |
| Purchase Plans | Draft, revise, cancel and review department forecast | Draft API in source: `/api/procurement/v1/plans` with P8 migration | Existing planning screen needs a live adapter; submission, approval, active versions, PR utilization and Finance period validation remain pending. A plan never reserves budget by itself. |
| Approvals / Budgets | Approve, return, reject, delegate, request exception | Demo | Workflow task ID, stage/quorum, assignee IDs, policy version, Finance budget reference, reason and immutable decision. Hard failures cannot advance without an authorized exception. |
| Get Quotes | Route approved lines, invite suppliers, publish, receive sealed bids | Demo; own-record sourcing draft API is available in source under `/api/procurement/v1/sourcing` with P9 line cancellation history | Existing RFQ screen needs an API adapter. Approved PR-line conversion, RFx version, invitation delivery, Q&A audience, bid receipt/version, opening authority and late/surrogate evidence remain governed. Supplier users see only their own participation. |
| Compare Quotes | Score, recommend and award selected lines | Demo | Evaluator score records, conflict declaration, normalized comparison, award approval and per-line remaining balance. Award does not itself issue a PO. |
| Contracts | Draft, review, sign reference, amend, renew, release | Demo; own-record contract draft API is available in source under `/api/procurement/v1/contracts` | Existing Contracts screen needs an API adapter. Signed version, effective dates, ceiling drawdown, amendment authority and renewal/termination outcome remain governed. Finance owns recurring payable schedules. |
| Purchase Orders | Draft, approve, issue, acknowledge, revise, close | Demo | Multi-line source allocation and schedules, approved revision, dispatch idempotency and delivery outcome; receipt and invoice progress are independent. |
| Deliveries & Services | Receive/inspect, accept, reverse, return | Demo | PO-line quantities, acceptance evidence, service milestone, reversal event, supplier replacement/credit and Inventory/Asset acknowledgment. |
| Bills / Inbox | Intake, duplicate check, match, resolve, send to AP | Demo | Invoice lines and source versions, configurable two/three-way result per line, exception owner, correction history and idempotent handoff. |
| Payment Status | View AP/Finance outcome | Demo | Finance callback with posting/payment reference, timestamp, partial amounts and reconciliation. Procurement has no payment-execution action. |
| Supplier portal | See own RFx/PO/invoice, respond and upload | Demo; live route held | Separate supplier identity and supplier-ID scope on every query/action; invitation expiry, duplicate submission and safe retry. |
| Analytics / Audit | Filter, export and trace a transaction | Demo | Authorized read model with definitions, currency basis, as-of time, export permission and full chain from request through Finance status. |

## Adapter sequence

1. **Draft records:** the reference workspace's Vendor list, editor and detail use the typed client in `src/platform/procurement-vendors-api.ts` when live mode is enabled and the `vendorDraft` capability is ready. Playwright covers create, refresh, edit, contact/address additions, withdrawal, denied list access, stale edits and route gating with a contract mock. This is source acceptance, not a production migration or supplier activation. Connect item and own-request screens next. Preserve the demo adapter for visual review; never silently mix demo rows into live lists.
2. **Controlled demand:** add submit, policy, Finance budget, approval and line-allocation contracts. The UI must expose blocked, pending and unknown dependency outcomes.
3. **Commercial commitment:** add RFx/award, contract and multi-line PO APIs with revision, issuance and supplier response.
4. **Fulfilment and Finance:** add line receipts, returns, invoice match, AP handoff and callback reconciliation.
5. **External and insight:** supplier identity/portal, document service, notifications, audit export and governed analytics.

For each adapter, replay the [gap register](procurement-ui-workflow-gap-register.md) with an allowed action, a forbidden action, stale/duplicate retry, refresh persistence, another company or supplier, keyboard and small-screen use. Mark a screen live only after its own source record and every visible action use the authoritative API.
