# Meridian ERP — Build Record (Backup)

Last updated: 2026-10-03. This file documents everything built so far, so work can be resumed or restored if a future prompt disrupts it.

## Product vision

Frontend-only, mock-data ERP dashboard. Multiple modules (HRM, Procurement, Finance, Inventory, Accounting) share ONE app shell, component library and design system. A new module adds only its own routes/screens — never copies or modifies shared components. No backend, no DB writes, no real auth — everything runs against a mock service layer with realistic delays, empty states and failure states.

## Tech stack

- TanStack Start v1 (React 19, Vite 7), file-based routing in `src/routes/`
- Tailwind CSS v4 via `src/styles.css` + `@theme` tokens (no tailwind.config.js)
- shadcn/ui components in `src/components/ui/`
- TanStack Query for data fetching
- Fonts: Plus Jakarta Sans (UI) + IBM Plex Mono (references/numbers), loaded via `<link>` in `__root.tsx`

## Theming

- `src/theme/tokens.css` — single source of truth for ALL brand/semantic colors (OKLCH, light + dark). Tokens: `--color-primary/secondary/accent/success/warning/danger/info` plus surface/background/border/text tokens. Mapped to Tailwind via `@theme` so components use `bg-primary`, `text-muted-foreground`, etc. NEVER hardcode hex or raw Tailwind colors in components. Rebranding = edit this one file.
- `src/styles.css` — imports tokens, accessibility base styles (reduced motion, visible focus rings).

## Platform layer (module-agnostic, reusable by every module)

- `src/platform/app-context.tsx` — `AppProvider` with Role, Entity, Branch, Theme, Setup status, and `ModuleId` ("hrm" | "procurement") + `setModuleId`. Persisted in localStorage key `erp.shell.state.v1`.
- `src/platform/nav.ts` — module-agnostic navigation schema (grouped sections, sub-groups when >8-9 items, single Configuration entry).
- `src/platform/use-mock.ts` + `src/platform/components/Async.tsx` — standard data fetching with loading/error/degraded states.
- `src/platform/components/AppShell.tsx` — header (module switcher with registry `moduleRegistry`, workspace/role switcher, entity switcher, ⌘K command palette, notifications, theme toggle, user menu) + responsive left nav rail. Coming-soon modules: Finance, Inventory, Accounting ("Not enabled").
- Reusable primitives in `src/platform/components/`:
  - `StatusBadge`, `States` (Empty/NoResults/Restricted/Degraded/Loading — note: EmptyState prop is `body`, not `description`)
  - `Sensitive` (masked values + deliberate reveal)
  - `StatusTimeline` (event, actor, timestamp, reason, before/after, evidence)
  - `CalculationExplainer` (result, inputs, rule version, effective date, diff)
  - `PageHeader` (eyebrow, title, description, one primary action)
  - `WorkQueue` (urgent exceptions > approvals > tasks > deadlines > metrics)
  - `ListPage` (saved views, search, filters, bulk actions, column picker, max 7 default columns)
  - `RecordDetail` (identity/status header, summary, sections, timeline, related records)
  - `GuidedFlow` (stepper, autosave draft, resumable, next steps)
  - `ApprovalPanel` (props: `decisionSummary`, `policy`, `conflicts`, `onDecision` — approve/return/reject/delegate, mandatory reason on negative)

## Mock layer (HRM)

- `src/mock/types.ts` — Worker, LeaveRequest, AttendanceCorrection, HrCase, Payslip, WorkItem, Role.
- `src/mock/data.ts` — realistic data: NL/KE/DE entities, branches, departments, varied worker types, long names, missing optional fields, historical + future-effective records, notifications.
- `src/mock/service.ts` — async `api` with simulated delays + `setDegraded` for failure states. Methods include `api.workers`, `api.worker(id)`, `api.leaveRequests`, `api.leaveRequest(id)`, `api.caseItem(id)`, `api.workQueue(role)`, `api.submit(type, payload)`.

## HRM module (COMPLETE — currently paused)

- `src/modules/hrm/nav.ts` — HRM rail + `configurationGroups` (Business setup, Process design, Security and compliance, Technical).
- Routes:
  - `/` `index.tsx` — Home: setup banner while setup incomplete, else WorkQueue + metrics; primary action "Request leave".
  - `/setup` `setup.tsx` — 6-step resumable setup guide (org basics > invite HR staff > capability tiers > core policies > first workers > review/go live) via GuidedFlow, flowId "hr-setup".
  - `/workers` `workers.index.tsx` — list with saved views/filters/bulk/columns.
  - `/workers/$id` `workers.$id.tsx` — employee profile (RecordDetail, StatusTimeline, MaskedValue sensitive section).
  - `/leave` `leave.index.tsx` — leave list (7 default columns, owner/next action/due date per row).
  - `/leave/new` `leave.new.tsx` — guided 5-step leave request with autosave draft.
  - `/leave/$id` `leave.$id.tsx` — leave decision (RecordDetail + ApprovalPanel).
  - `/requests/$id` `requests.$id.tsx` — HR case detail.
  - Stubs (AppShell + PageHeader + EmptyState): `/attendance`, `/requests`, `/approvals`, `/payslips`, `/configuration`, `/speak-up`, `/help`.

## Procurement module (starter slice — current work)

- `src/modules/procurement/types.ts` — Supplier, PurchaseRequest, ProcWorkItem.
- `src/modules/procurement/data.ts` — 5 suppliers, 5 purchase requests (PR-2026-1042 laptops €18,450 In review; PR-2026-1043 boots KES 386,000 Submitted; PR-2026-1038 chairs €7,200 Approved; PR-2026-1035 freight KES 940,000 Returned; PR-2026-1044 welcome packs Draft), `procApi` (purchaseRequests, purchaseRequest, suppliers, workQueue(role)).
- `src/modules/procurement/nav.ts` — `procurementModule` (Home, Purchasing, Approvals, Receiving, Configuration) + `procConfigurationGroups`.
- Routes:
  - `/procurement` `procurement.index.tsx` — Home with WorkQueue + metrics.
  - `/procurement/requests` `procurement.requests.tsx` — ListPage (saved views, dept/status filters, bulk export, column picker).
  - `/procurement/requests/$id` `procurement.requests.$id.tsx` — decision screen: line items table + ApprovalPanel with policy/conflicts.
  - `/procurement/suppliers` `procurement.suppliers.tsx` — supplier ListPage.
  - `/procurement/configuration` `procurement.configuration.tsx` — single grouped Configuration entry point.
- NOT YET BUILT: guided "New purchase request" flow (button is disabled stub), Approvals list, Receiving screens.

## Conventions to preserve

- Every route has its own `head()` with unique title/description/og tags; no og:image on `__root`.
- `createFileRoute` string must match filename mapping exactly; never edit `src/routeTree.gen.ts`.
- One primary action per screen; every record shows status, owner, next action, due date, timeline.
- WCAG 2.2 AA: keyboard operable, visible focus, no color-only status, 320px responsive, reduced motion.
- Typecheck: `bunx tsgo --noEmit` (currently clean). Build log: `/tmp/observability/build-errors.log`.
- Git: Lovable internal storage only — no GitHub repo connected.

## Known pending items

1. Guided "New purchase request" flow for Procurement.
2. Procurement Approvals + Receiving screens.
3. HRM stubs to flesh out (attendance correction, payslip + CalculationExplainer, speak-up intake).
4. Finance, Inventory, Accounting modules (not enabled).
