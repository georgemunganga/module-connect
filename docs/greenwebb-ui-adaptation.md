# Greenwebb Procurement UI adaptation register

**Reference:** `Greenwebb/zoho-procurement-ui` at `7062b3e` (16 October 2026). The user identifies this as their own UI work and asked us to reuse its behavior in the ERP. Its 104 routes are a browser-local React Router prototype; its 118 screenshots are reference material in `docs/`, not application assets. The reference has no license file. This register tracks adaptation into the existing TanStack Procurement frontend without replacing its ERP shell, branding, typed domain records, or live-mode gate.

| Reference behavior | ERP destination | Adaptation rule | Status |
| --- | --- | --- | --- |
| Shared shell, search, navigation | `src/platform/components/AppShell.tsx` | Keep ERP brand, company scope, role-aware menu and HRMS-compatible components. | Existing ERP behavior |
| Saved views, filters, sort, columns, selection, export scopes | `src/platform/components/ListPage.tsx` | Reuse generic controls in configured lists; preserve current routes and company filtering. Supplier list uses sort and current/selected export. | Shared controls adapted; rollout to other lists pending |
| Choose → Match → Review import; CSV/TSV, sample, skip invalid/duplicate rows | `src/platform/components/DataTransfer.tsx`, record import routes | Keep imported vendors Proposed and items Inactive. No unsupported file format claim. | Adapted for vendor and item imports |
| Vendor Overview, Comments, Transactions, Mails, Statement | `src/routes/procurement.suppliers_.$id.tsx` | Keep diligence/Finance checks; notes and message drafts stay local, statement is a procurement-side preview limited by linked invoice entity. | Adapted; browser acceptance pending |
| Vendor seven-tab create/edit | `src/routes/procurement.suppliers_.new.tsx` | Keep legal identity, contacts, sites, masked bank reference, custom fields, tags and remarks. | Existing ERP behavior; compare each field |
| Item list/detail/edit | Catalog routes and `CatalogItemEditor` | Preserve item type, entity eligibility and unpublished offers. Manage list uses shared list controls; new requests retain catalog item IDs and detail links related requests by ID. | Item list and linked requests adapted; wider transactions pending |
| One resumable six-stage RFQ wizard, nested Add Item/User | Sourcing new/detail routes | Add step resume and nested dialogs without weakening sealed bids, competition or award controls. | Planned |
| Canonical list → detail → edit and return to origin | Procurement record routes | Carry source queue/tab and draft context; keep stable IDs. | Partial |
| PO, receive, bill, recurring bill, credit and batch editors | Commercial and payables areas | Preserve distinct fields and calculations. Finance owns recurring payables, batch payments and payment execution; Procurement shows status/reference. | Partial; see workflow gap register |
| Inbox filename → bill draft | Payables inbox and invoice new | Preserve draft prefill; file name alone never counts as uploaded or extracted evidence. | Partial |
| Vendor transaction linking | Vendor profile + orders/invoices | Use stable supplier IDs at API boundary; current demo names remain display only. | Partial |
| Settings preferences/tabs/builders | Procurement Configuration and shared ERP settings | Preview-only builders cannot silently publish policy or execute automation. | Partial |
| Analytics/export | Procurement reports | Define metric and currency basis; authorize exports and keep Finance ledger separate. | Partial |

## Preservation checks

For each adapted area, verify: the reference action still has a reachable equivalent; create/view/edit paths keep one canonical record; search, filters, selection and return context survive navigation; edits persist in demo mode; invalid and duplicate inputs explain recovery; restricted roles and another company cannot access the record; the live-mode gate never displays local demo transactions as real records; keyboard and mobile use remain possible.

The reference's generic `AppRecord`/string metadata, direct React Router tree and local approval/payment actions are not API contracts. The ERP [UI/API contract register](procurement-ui-contract-register.md) and [workflow gap register](procurement-ui-workflow-gap-register.md) remain the source for live integration and unresolved workflows. No reference screenshots will be copied into `public/` or product screens.

## Next integration slices

1. Apply the shared list controls to remaining transaction management lists while preserving each record's existing actions and state rules.
2. Preserve RFQ draft state through nested item and team selectors, then validate the saved draft and approval hand-off.
3. Carry queue/tab return context through all detail/edit/new routes, including supplier creation from a transaction.
4. Extend stable IDs through orders and receipts before presenting them as item or vendor transactions.
5. Connect approval, policy, documents, audit and Finance/AP status through the ERP APIs. The reference project has no backend to salvage for these flows.

The source project's route count is not an ERP completion measure: many routes are settings previews or browser-only actions. This register marks adapted behavior explicitly and leaves incomplete behavior visible.
