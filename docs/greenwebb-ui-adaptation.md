# Greenwebb Procurement UI adaptation register

**Reference:** `Greenwebb/zoho-procurement-ui` at `7062b3e` (16 October 2026). The user identifies this as their own UI work and asked us to reuse its behavior in the ERP. Its 104 routes are a browser-local React Router prototype; its 118 screenshots are reference material in `docs/`, not application assets. The reference has no license file. This register tracks adaptation into the existing TanStack Procurement frontend without replacing its ERP shell, branding, typed domain records, or live-mode gate.

| Reference behavior | ERP destination | Adaptation rule | Status |
| --- | --- | --- | --- |
| Shared shell, search, navigation | `src/platform/components/AppShell.tsx` | Keep ERP brand, company scope, role-aware menu and HRMS-compatible components. Add role-aware quick create, scoped record search, procurement alerts and a role-filtered workflow guide through the existing shell. | Adapted in ERP shell |
| First-use journey and buyer home | Procurement home and Getting Started routes | Keep three plain-language steps, company-scoped readiness, and clear demo labels. Show buyer metrics and company/currency-aware PO trends. | Adapted for demo |
| Saved views, filters, sort, columns, selection, export scopes | `src/platform/components/ListPage.tsx` | Reuse generic controls in configured lists; preserve current routes and company filtering. Supplier, bill, credit and commercial lists use scoped controls. | Shared controls adapted; rollout to other lists pending |
| Choose → Match → Review import; CSV/TSV, sample, skip invalid/duplicate rows | `src/platform/components/DataTransfer.tsx`, record import routes | Keep imported vendors Proposed and items Inactive. No unsupported file format claim. | Adapted for vendor and item imports |
| Vendor Overview, Comments, Transactions, Mails, Statement | `src/routes/procurement.suppliers_.$id.tsx` | Keep diligence/Finance checks; notes and message drafts stay local, statement is a procurement-side preview limited by linked invoice entity. | Adapted; browser acceptance pending |
| Vendor seven-tab create/edit | `src/routes/procurement.suppliers_.new.tsx` | Keep legal identity, contacts, sites, masked bank reference, custom fields, tags and remarks; edited profiles retain ID/history and return to review. | Create and guarded edit adapted |
| Item list/detail/edit | Catalog routes and `CatalogItemEditor` | Preserve item type, entity eligibility and unpublished offers. Item detail has overview, ID-linked requests, orders, deliveries, authorized bills and history tabs. New direct and single-line award orders carry the catalog item ID. | Adapted for demo; older orders without an item ID remain unlinked |
| One resumable six-stage RFQ wizard, nested approved-item picker | Sourcing new/detail routes | Save draft, select partial approved quantities, name and describe the request, set a future deadline, preview supplier-facing information, return to source request, and recheck eligibility before submission. A nested colleague picker uses active same-company HRMS demo worker IDs for planning without granting access. | Adapted for demo; live identity directory pending |
| Canonical list → detail → edit and return to origin | Procurement record routes | Commercial orders, receiving, contracts and evaluations preserve validated list search, status, display, sort and column choices through detail/back navigation; keep stable IDs. | Commercial routes adapted; other flows partial |
| Purchase Request list controls | `src/routes/procurement.requests.tsx` | Sort and export the current or selected company-scoped view; keep existing saved views, filters and detail links. | Adapted |
| PO, receive, bill, recurring bill, credit and batch editors | Commercial and payables areas | Commercial and bill lists retain cards and add shared table controls; bill CSV export is scoped to AP and Procurement administrators. Vendor credits can be added against bills by AP/Procurement administrators with duplicate and amount checks, then searched, filtered and exported in scope. Finance owns recurring payables, batch payments and payment execution. | List and credit reference views adapted; editors partial |
| Inbox filename → bill draft | Payables inbox and invoice new | Queue up to 20 PDF/image/CSV filenames by company, remove or open each as a bill draft. No file content is uploaded, read or extracted. | Adapted for demo |
| Vendor transaction linking | Vendor profile + orders/invoices | Supplier profile uses stable supplier IDs for linked orders and bills. Seed orders and new award/contract-release orders carry the ID where the supplier is resolved in entity scope; unmatched older orders remain unlinked. | Adapted for linked demo records; live API contract pending |
| Settings preferences/tabs/builders | Procurement Configuration and shared ERP settings | Purchase Order and Bill settings plus Vendors, Items, Purchases, Purchase Requests, Quote Requests, Receives and Vendor Credits share six-tab navigation. The extra transaction pages explain fields, validation, actions, approval choices and related records without changing published policy. | Transaction guidance adapted; ERP-owned settings and executable builders remain pending |
| Analytics/export | Procurement reports | Define metric and currency basis; authorize exports and keep Finance ledger separate. | Partial |

## Preservation checks

For each adapted area, verify: the reference action still has a reachable equivalent; create/view/edit paths keep one canonical record; search, filters, selection and return context survive navigation; edits persist in demo mode; invalid and duplicate inputs explain recovery; restricted roles and another company cannot access the record; the live-mode gate never displays local demo transactions as real records; keyboard and mobile use remain possible.

The reference's generic `AppRecord`/string metadata, direct React Router tree and local approval/payment actions are not API contracts. The ERP [UI/API contract register](procurement-ui-contract-register.md) and [workflow gap register](procurement-ui-workflow-gap-register.md) remain the source for live integration and unresolved workflows. No reference screenshots will be copied into `public/` or product screens.

## Next integration slices

1. Apply the shared list controls to remaining transaction management lists while preserving each record's existing actions and state rules.
2. Replace the demo worker projection in the RFQ colleague selector with the shared identity directory and enforce live role checks when collaborators are assigned.
3. Carry queue/tab return context through the remaining detail/edit/new routes, including supplier creation from a transaction.
4. Extend stable supplier IDs and line-level item IDs through all multi-line orders before presenting every vendor or item transaction as linked.
5. Connect approval, policy, documents, audit and Finance/AP status through the ERP APIs. The reference project has no backend to salvage for these flows.

The source project's route count is not an ERP completion measure: many routes are settings previews or browser-only actions. This register marks adapted behavior explicitly and leaves incomplete behavior visible.
