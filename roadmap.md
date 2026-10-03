# Roadmap — Procurement UI (prompt pack milestones)

Milestones below mark **screen-group coverage in the browser-local prototype**, not full acceptance of every state in the 20 prompts. See `docs/procurement-ui-gap-review.md` for the remaining frontend work and backend boundaries. HRM stays paused and untouched.

- [x] 00 — Procurement UI foundation: 9 role presets, Demo data indicator, typed mock boundary, shared patterns, route list
- [x] 01 — Role-aware navigation and Home (employee vs buyer vs approver vs auditor views)
- [x] 02 — Guided buying entry (Create Request: goods/service/asset/subscription, catalog-first, drafts)
- [x] 03 — Items and catalog (`/procurement/catalog`)
- [x] 04 — Supplier onboarding, profile, risk, performance
- [x] 05 — Procurement planning workspace (`/procurement/planning`)
- [x] 06 — Requisition workspace and line routing
- [x] 07 — Approvals and budget control
- [x] 08 — Sourcing, RFx and bids (`/procurement/sourcing`)
- [x] 09 — Bid evaluation, comparison, award
- [x] 10 — Contracts, frameworks, recurring commitments
- [x] 11 — Purchase orders and amendments (`/procurement/orders`)
- [x] 12 — Receiving, inspection, returns (`/procurement/receiving`)
- [x] 13 — Invoice intake and supplier adjustments (`/procurement/invoices`)
- [x] 14 — Match workbench, AP handoff, payment visibility
- [x] 15 — Supplier portal (`/supplier`, separate shell)
- [x] 16 — Reports, collaboration, audit (`/procurement/reports`)
- [x] 17 — Configuration and policy simulator
- [x] 18 — Responsive layout, keyboard labels, and recovery states pass
- [x] 19 — Final browser demo journeys across requisition, sourcing, purchasing, receipt, and invoice

The connected three-line end-to-end scenario, several exception variants, full evaluator/award coverage, and route-by-route accessibility/recovery verification are still open. Production integrations and server-side authorization remain separate implementation work.
