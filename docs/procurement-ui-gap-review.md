# Procurement UI acceptance review

Reviewed 3 October 2026 against `PROC-UX-02-COMPLETE-LOVABLE-UI-PROMPT-PACK.md` in the ERP documentation repository. This is a browser-local frontend prototype. A check in `roadmap.md` means the corresponding screen group exists; it does **not** mean every operation and negative path in that prompt has passed acceptance.

## Current result

The Procurement navigation, role-specific home, catalog, supplier, request, approval, planning, sourcing, evaluation, contract, PO, receiving, invoice, reporting, configuration, and supplier portal screens exist. Request-to-PO, RFQ-to-award, receipt-to-match, and supplier portal interactions have been tested independently. **The full frontend is not yet complete against the agreed prompt pack.**

## Feature acceptance ledger

| Prompts | Browser-local UI coverage | Remaining frontend acceptance work |
| --- | --- | --- |
| 00–01 Foundation and navigation | Internal and supplier shells, role switcher, entity context, demo marker, navigation and main queues | Route-by-route keyboard and narrow-screen pass; confirm every home task uses current records rather than seed-only tiles |
| 02–03 Guided buying and catalog | Catalog search/detail, buyer item editor, contract offers, catalog-to-request, draft request | Complete attachment failure and unavailable budget examples; verify all catalog edge states across entities |
| 04 Supplier onboarding | Queue, onboarding, evidence, duplicate review, portal change review, separate Procurement and Finance reference, activation and suspension | Qualify full expiry and affected-obligation review states |
| 05 Planning | Plan list/detail, versions, changes and linked request views | Confirm all plan-to-request links and review state permissions with each role |
| 06 Requisition | Line approval, routing, active supplier selection, quantities, related records, return/withdraw/close and version cues; three-line split to RFQ, direct PO and contract release verified | Concurrent conversion and cancelled remainder recovery |
| 07 Approval and budget | Approval task UI, policy version, advisory/hard budget states, effective-dated same-entity delegation and admin cross-entity repair | Verify parallel quorum, stale authority, and exception approval paths in browser |
| 08 Sourcing | Event wizard, invitation tracker, sealed bids, surrogate capture, controlled opening, amendments; new event creates a linked evaluation workspace | Draft editing after return/reopen; supplier notification delivery failure and resend result; no-response closure |
| 09 Evaluation and award | Compliance, score, normalized estimate, recommendation, separate award approval and PO/contract draft | Individual evaluator score history, line-level partial award, multi-currency basis, no-award reroute, and award balance checks for every entity |
| 10 Contracts | Contract detail, signature reference, amendments, framework release, recurring and ceiling views | Full renewal and old signed version decision path; document-access review |
| 11 Purchase orders | Draft/approval/issue, supplier response, revision, blanket release, receipt and invoice tracks | Duplicate dispatch retry, expiry, partial cancellation and closure with financial balance validation |
| 12 Receiving | Goods/service acceptance, inspection evidence, reversal and return references | Lot/serial and photo evidence fields; conditional acceptance and replacement/credit loop |
| 13–14 Invoice and AP | Intake, duplicate check, match/exception, supplier correction request and linked replacement, supplier credit reference and commercial handoff, AP handoff and Finance demo callbacks | Unknown send outcome, conflicting callback, PO/receipt/credit correction routes, and supplier-visible refund status |
| 15 Supplier portal | Own RFx/PO/invoice/document/message screens; live RFx and PO linkage; profile/evidence submissions reach the internal supplier review; linked invoice replacement | Actual file upload and failed upload/retry states |
| 16 Reports and collaboration | Derived scoped measures, record links, CSV summary, comments and activity on selected records | Definition/source freshness for all measures, saved filters, full chain reconstruction and audience-specific comments on every record |
| 17 Policy | Versioned draft/publish simulator and rule views | Effective-date collisions, missing authority and replacement-history acceptance pass |
| 18–19 Quality and final journey | TypeScript/lint/build checks; phone-width route pass; one three-line request reached RFQ bid, award, three PO issues, goods/service acceptance, invoice match, AP, simulated Paid, reconciled line quantities, and PR closure. Inactive supplier, hard budget, over-receipt, sealed bid, duplicate invoice and supplier-scope failures replayed | Full tablet/keyboard route audit and remaining negative paths: above-authority award, AP rejection, stale callback, concurrency |

## Verified in this review

- Catalog item creation and catalog-to-request preselection work in the browser; requester-only actions are hidden from admin roles.
- A Kenya supplier cannot be activated until the independent Finance verification reference is recorded. Once active, the linked draft PO displays the approved boots quantity and value.
- An approved request line set to RFQ opens the sourcing wizard with that line selected; an incomplete RFQ draft is no longer created from the request screen.
- Supplier PO change requests reach the commercial PO and hold it for buyer action; supplier invoice submission creates a pending local invoice against an issued own PO.
- Supplier contact changes and qualification references appear in the internal supplier profile for accept/return review.
- An AP correction request leaves the original invoice lines intact. The supplier can submit a new invoice linked to the exception; both records link to each other in the internal view.
- A supplier can submit a credit note reference against its own invoice; an internal commercial reviewer can mark it for Finance without claiming a posted credit or refund.
- Manager request visibility is limited to the Engineering demo team and their own requests; buyer-only request creation links are hidden. New request records use the procurement legal entity reference rather than a country label.
- The Kenya cross-entity approval task can be reassigned by Procurement admin to a Kenya approver; the hard budget failure remains visible and blocks approval.
- Manager approval queues and details now show only tasks assigned to that entity's demo manager; buyer queues show Procurement stages. Delegation is disabled on cross-entity assignments and already delegated tasks.
- A buyer can select an active supplier on an approved non-catalog line and create a linked draft PO; the draft keeps the line's source reference and does not issue a commitment.
- One new three-line request was submitted, approved, and split into RFQ, direct PO, and contract release. The RFQ was published, a supplier bid stayed sealed until opening, an evaluation was approved, and the resulting PO was issued, acknowledged, received, invoiced, matched, handed to AP, and marked Paid by the Finance demo callback. The direct and contract POs were issued and their services accepted. All three PR lines reconciled and the request closed; the sourced line retained RFQ/PO/GRN references.
- Negative-path browser checks blocked a PO for an inactive supplier, kept a hard budget failure visible, rejected an over-receipt, hid sealed bid values, rejected a duplicate invoice key, and restricted the internal supplier profile from the supplier portal role. No page errors occurred.
- Reports calculate scoped values from local procurement, commercial, receiving and invoice records; Procurement admin can download a summary CSV. No Finance budget or actual is fabricated.

## Backend-owned boundaries

Browser storage cannot provide server-enforced tenant and supplier isolation, durable audit, authorization, concurrency, real attachments, Finance budget reservations, AP posting, payment confirmation, HRMS sync, inventory/asset handoffs, external messages or supplier authentication. The UI labels these as simulated or pending. They need contracts and services before production use.
