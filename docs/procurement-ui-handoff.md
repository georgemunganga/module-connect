# Procurement frontend handoff

This repository is the Lovable-connected **frontend demo** for the ERP Procurement module. Browser storage holds the demo records and decisions. The functional source of truth is the ERP specification in `newworld-erp/docs/procurement`; this frontend does not provide server authorization, Finance posting, payments, supplier identity, document storage, or live integration events.

Screen groups exist for the feature map below. The full UI acceptance work is tracked in [the gap review](procurement-ui-gap-review.md); several exception and recovery states remain open.
The [workflow gap register](procurement-ui-workflow-gap-register.md) lists the incomplete user paths and the UI needed to finish them.

## Starting points and routes

| Role | Starting point | Main work areas |
| --- | --- | --- |
| Employee | `/procurement` | Catalog, My requests, guided request |
| Manager | `/procurement` | Approvals, requests, planning |
| Buyer | `/procurement` | Requests, sourcing, evaluations, contracts, orders, receiving, invoices, reports |
| Supplier steward | `/procurement` | Supplier queue and profiles |
| Receiver | `/procurement` | Purchase orders and receiving |
| AP processor | `/procurement` | Invoice inbox, capture, match, exceptions, AP handoff demo |
| Procurement admin | `/procurement` | Three-step Getting started guide, all internal work areas, policy simulator, demo reset |
| Auditor | `/procurement` | Read-only records and reports |
| Supplier user | `/supplier` | Separate supplier-scoped portal |

The internal route groups are `/procurement/getting-started`, `/procurement/catalog`, `/procurement/requests`, `/procurement/approvals`, `/procurement/suppliers`, `/procurement/planning`, `/procurement/sourcing`, `/procurement/evaluations`, `/procurement/contracts`, `/procurement/orders`, `/procurement/receiving`, `/procurement/invoices`, `/procurement/reports`, and `/procurement/configuration/policy`. The Settings directory is at `/procurement/configuration`, Bill settings at `/procurement/configuration/bills`, and vendor CSV import at `/procurement/suppliers/import`. Detail routes use the record reference. The supplier portal has its own shell at `/supplier`.

The administrator's first-use guide groups nine real route links into three steps: buying controls, first purchase, and invoices/Finance. A review acknowledgement is saved per entity in the current browser. It is a guide progress marker, not evidence that a policy or integration has been activated. Finance remains the owner of payment methods and payment execution.

The sidebar groups work by audience: Home, My Requests, Approvals, Items, Vendors, Procurement, Payables, Budgets and Analytics, with Configuration for administrators. Procurement expands to requests, quotes, evaluations, orders, receipts, contracts and planning according to role. Payables expands to Inbox, Bills and Payment Status. `Budgets` displays recorded Finance check results and reservation references; it does not invent a live balance. Recurring bills, batch payments and payment execution remain Finance-owned capabilities and have no misleading live links in the Procurement demo.

## Feature-to-screen map

| Specification | Frontend surface |
| --- | --- |
| PROC-CFG-01 Procurement configuration and policy | `/procurement/configuration`, `/procurement/configuration/policy` |
| PROC-01 Supplier onboarding and management | `/procurement/suppliers`, `/procurement/suppliers/new`, `/procurement/suppliers/:id` |
| PROC-02 Purchase requisition and line routing | `/procurement/requests`, `/procurement/requests/new`, `/procurement/requests/:id` |
| PROC-03 Approval and budget control | `/procurement/approvals`, `/procurement/approvals/:id`, PR detail |
| PROC-04 Procurement items and catalog | `/procurement/catalog`, `/procurement/catalog/:id`, guided request |
| PROC-05 Procurement planning | `/procurement/planning` |
| PROC-06 Strategic sourcing and award | `/procurement/sourcing`, `/procurement/sourcing/:id`, `/procurement/evaluations/:id` |
| PROC-07 Contracts, frameworks and recurring commitments | `/procurement/contracts`, `/procurement/contracts/:id` |
| PROC-08 Purchase orders and amendments | `/procurement/orders`, `/procurement/orders/:id` |
| PROC-09 Receiving, inspection and returns | `/procurement/receiving`, `/procurement/receiving/:id` |
| PROC-10 Invoice intake and supplier adjustments | `/procurement/invoices/new`, `/procurement/invoices/:id` |
| PROC-11 Invoice match, AP handoff and payment visibility | `/procurement/invoices/:id`, `/supplier` |
| PROC-12 Supplier portal | `/supplier` |
| PROC-13 Supplier performance and risk | `/procurement/suppliers/:id`, `/procurement/reports` |
| PROC-14 Analytics, controls and collaboration | `/procurement/reports`, `/procurement/configuration/policy`, record timelines/comments |

Basic list pages now use centered, action-oriented empty states when the entity or selected view has no records. Search/filter misses show a separate recovery state. Vendors support browser-local Add, CSV Import, contact Add/Edit/Remove, suspension, and controlled deactivation; no record is physically deleted. Settings entries are marked Open or Reference, and Bill approval type choices are explicitly preview-only.

The New Vendor page now has primary contact fields plus seven tabs: Other Details, Address, Contact Persons, Bank Details, Custom Fields, Reporting Tags and Remarks. It validates the required identity/contact fields, additional contacts and masked bank reference, then saves the details into a review-state vendor profile. Document selection is limited to 10 files of 10 MB each; only names, sizes and classifications are retained in this browser demo. Qualification evidence is still Missing until authorized review. Portal access is a request, not an active login.

## Connected demo record

`PR-2026-1042` contains a laptop line and a docking-station line. Its laptop line links to `PO-2026-1042`, receipt `GRN-2026-1042`, and invoice `INV-1042`. The PO has 12 laptops at EUR 1,230; eight were accepted, while the supplier invoice bills ten. The invoice therefore shows a quantity exception. A buyer can also route the approved docking-station balance to a new draft PO. Its approval and issue update the PR's allocated and ordered quantities; recording a receipt updates accepted quantity.

Other connected paths are available for review: `CON-2026-0030` is an active Northwind framework that can release a draft PO; `RFQ-2026-0061` has a quotation ready for evaluation, award approval, and draft PO creation; `RFQ-2026-0062` accepts a sealed Northwind quotation from the supplier portal, then supports a controlled close/open step and evaluation. A guided subscription request can route its approved line against the active framework. These routes keep source references on the generated transaction.

`PR-2026-1043` is an approved Kenya safety-boots request allocated to draft `PO-2026-0044`. Kifaru Safety Ltd must receive a recorded independent Finance verification reference before activation; the draft PO cannot move to approval while the supplier is inactive. Supplier portal contact and qualification submissions enter the internal supplier review queue rather than changing approved master data immediately.

The source records are browser-local demo data. A fresh browser starts from the seeded data; the Procurement admin can reset Procurement transactions from Home. For production, replace the browser stores with API adapters and enforce every permission, approval, entity boundary, supplier scope, and concurrency rule on the server.

## Frontend verification

- Production build, TypeScript check, and semantic ESLint check pass under Node 22.
- Browser route checks covered buyer, AP, supplier, and procurement-admin views. Internal records are hidden from supplier role; commercial detail screens apply entity scope; the supplier portal pins its demo identity to one supplier.
- The responsive pass includes phone-width list tables, planning, PO and receiving detail. Wide data tables scroll within their own cards and the side navigation collapses behind the mobile menu.
- Browser journeys verified a single three-line PR across RFQ, direct PO, and contract release; supplier bid → sealed response → controlled opening → evaluation → award PO; PO issue → supplier acknowledgment → goods receipt → supplier invoice → match → AP handoff → simulated Finance Paid; and source PR quantity reconciliation. No page errors occurred in the final connected run.
- The Getting started guide was checked at phone width: Home links to the guide, review progress persists after reload, and progress is separate for Netherlands and Kenya. An employee role cannot open the administrator guide.
- The grouped sidebar was checked for Procurement admin and employee roles; the mobile drawer opened Payables → Inbox at 390 px without page errors. The Invoice Inbox, Bills, Payment Status and Budgets destinations display distinct views.

## Remaining production boundaries

The interface labels simulated Finance callbacks, payment status, uploads, notices, and policy publication. Browser storage is suitable for prototype review and cannot provide durable audit, segregation of duties, financial posting, or tenant isolation. Finance/AP, HRMS, Inventory, Assets, budgets, document scanning, supplier identity, and payment execution still require the ERP integration contracts defined in the specifications.
