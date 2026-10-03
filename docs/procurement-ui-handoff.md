# Procurement frontend handoff

This repository is the Lovable-connected **frontend demo** for the ERP Procurement module. Browser storage holds the demo records and decisions. The functional source of truth is the ERP specification in `newworld-erp/docs/procurement`; this frontend does not provide server authorization, Finance posting, payments, supplier identity, document storage, or live integration events.

## Starting points and routes

| Role | Starting point | Main work areas |
| --- | --- | --- |
| Employee | `/procurement` | Catalog, My requests, guided request |
| Manager | `/procurement` | Approvals, requests, planning |
| Buyer | `/procurement` | Requests, sourcing, evaluations, contracts, orders, receiving, invoices, reports |
| Supplier steward | `/procurement` | Supplier queue and profiles |
| Receiver | `/procurement` | Purchase orders and receiving |
| AP processor | `/procurement` | Invoice inbox, capture, match, exceptions, AP handoff demo |
| Procurement admin | `/procurement` | All internal work areas, policy simulator, demo reset |
| Auditor | `/procurement` | Read-only records and reports |
| Supplier user | `/supplier` | Separate supplier-scoped portal |

The internal route groups are `/procurement/catalog`, `/procurement/requests`, `/procurement/approvals`, `/procurement/suppliers`, `/procurement/planning`, `/procurement/sourcing`, `/procurement/evaluations`, `/procurement/contracts`, `/procurement/orders`, `/procurement/receiving`, `/procurement/invoices`, `/procurement/reports`, and `/procurement/configuration/policy`. Detail routes use the record reference. The supplier portal has its own shell at `/supplier`.

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

## Connected demo record

`PR-2026-1042` contains a laptop line and a docking-station line. Its laptop line links to `PO-2026-1042`, receipt `GRN-2026-1042`, and invoice `INV-1042`. The PO has 12 laptops at EUR 1,230; eight were accepted, while the supplier invoice bills ten. The invoice therefore shows a quantity exception. A buyer can also route the approved docking-station balance to a new draft PO. Its approval and issue update the PR's allocated and ordered quantities; recording a receipt updates accepted quantity.

The source records are browser-local demo data. A fresh browser starts from the seeded data; the Procurement admin can reset Procurement transactions from Home. For production, replace the three local stores with API adapters and enforce every permission, approval, entity boundary, supplier scope, and concurrency rule on the server.

## Frontend verification

- Production build, TypeScript check, and semantic ESLint check pass under Node 22.
- Browser route sweep covered buyer, AP, supplier, and procurement-admin views. Internal records are hidden from supplier role; commercial detail screens apply entity scope; the supplier portal pins its demo identity to one supplier.
- At a 390 px phone viewport, the PO and receiving details had no horizontal page overflow. The side navigation collapses behind the mobile menu.
- Browser flow verified: approved PR line → direct PO draft → procurement-admin PO approval → issue → PR ordered quantity updated. No page errors occurred.

## Remaining production boundaries

The interface labels simulated Finance callbacks, payment status, uploads, notices, and policy publication. Browser storage is suitable for prototype review and cannot provide durable audit, segregation of duties, financial posting, or tenant isolation. Finance/AP, HRMS, Inventory, Assets, budgets, document scanning, supplier identity, and payment execution still require the ERP integration contracts defined in the specifications.
