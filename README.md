# Module Connect

Build a frontend-only, mock-data UI/UX dashboard for an ERP application, starting with the HRM

module. This is the first of several modules (HRM, Finance, Procurement, Inventory, Accounting)

that will all share the same app shell, component library and design system — so the top

priority is a clean separation between REUSABLE, MODULE-AGNOSTIC building blocks and

HRM-SPECIFIC screens/content built on top of them.

TECH

- React + TypeScript + Tailwind CSS + shadcn/ui.

- No backend, no database writes, no real auth, no real notifications, no real file storage,

  no real payroll calculation, no real statutory submissions. Everything runs against a mock

  service layer with realistic delays, empty states and failure states.

- Organize code so a future module (e.g. Finance) can reuse the shell and component library by

  only adding its own routes/screens — never by copying and modifying shared components.

THEMING / BRAND CONFIGURATION (this is what makes it reusable across modules)

- Define brand colors as CSS custom properties (--color-primary, --color-secondary,

  --color-accent, --color-success, --color-warning, --color-danger, --color-info, plus

  surface/background/border/text tokens), mapped into tailwind.config as semantic color names

  (bg-primary, text-primary, border-primary, etc.) — never hardcode a hex/Tailwind color

  directly in a component.

- Put the token values in one central theme file so switching brand colors for a different

  module or a different customer is a one-file change, not a find-and-replace across components.

- Support light and dark mode from the same token set.

APP SHELL (build first, reused by every future module)

- Workspace switcher, organization/entity context switcher, global search, command palette,

  notifications panel, tasks/approvals indicator, help, user menu.

- Left navigation rail with role-based, grouped sections (not a flat list of 60+ links). Any

  section with more than ~8-9 sub-items gets split into labeled sub-groups instead of staying

  one long list. Top-level rail items can go up to ~12 since it's a persistent, spatially-learned

  rail, not something re-scanned every time.

- Exactly ONE "Configuration" entry point for the whole module, internally organized into

  labeled sub-groups (e.g. Business setup, Process design, Security and compliance, Technical) —

  never scatter admin/setup screens elsewhere in the app.

REUSABLE COMPONENT LIBRARY (module-agnostic — build these as generic primitives)

- App frame / nav rail / workspace switcher

- Work queue (prioritized: urgent exceptions > approvals due > tasks > deadlines > metrics)

- Filterable list page (title, saved views, search, filters, results, bulk actions after

  selection, column picker, max 7 default columns)

- Record detail page (identity/status header, one primary action, summary, sections, timeline,

  related records)

- Guided step flow for create/change actions (choose purpose > essential details > review/policy

  > evidence > review > submit > next steps), autosaving as draft

- Approval component (decision summary, policy/rule results, history, conflicts, evidence,

  approve/return/reject/delegate, mandatory reason on negative decisions)

- Status timeline (human-readable event, actor, timestamp, reason, before/after, evidence link)

- Calculation explanation component (result, inputs, rule version, effective date, explanation,

  diff from prior result) — used anywhere a number needs to be trusted, not just payroll

- Empty state, restricted/not-found state, degraded-service state

- Sensitive-data patterns: masked values, deliberate reveal, neutral not-found for undisclosable

  records

CORE UX PRINCIPLES (apply everywhere, not just HRM)

- Ten-second test: a user must be able to tell where they are, what needs attention, the primary

  action, what's required, and what happens after submitting.

- One primary action per screen. Common tasks reachable within 3 navigation decisions from Home.

- Progressive disclosure: summary > details > advanced (never mix routine actions with

  system-admin controls on the same screen).

- Target WCAG 2.2 AA: full keyboard operability, visible focus order, no color-only status,

  responsive down to 320px, reduced-motion support.

- Every transactional record shows status, owner, next action, due date, timeline and available

  actions — never a bare "pending" with no context.

FIRST BUILD SLICE (HRM module, in this order)

1. Initial HR-admin setup guide — the first real user is an admin setting up from empty, not an

   employee. A short, linear, resumable, skippable guide: organization basics > invite HR staff

   and assign roles > choose which capability tiers to enable (safe defaults preselected) > core

   policies with safe defaults > add/import first workers > review and go live. Home only

   switches to its normal work-queue view once this completes.

2. App shell with role-based workspaces (Employee, Manager, HR operations, Payroll, HR admin)

3. Home / work queue

4. Employee profile

5. Leave request + leave approval

6. Attendance correction

7. HR request (generic case/ticket submission)

8. Payslip view with the calculation-explanation component

9. Anonymous protected-disclosure intake (must not disclose case existence to unauthorized

   viewers; no account required; minimal metadata)

Use realistic mock data: multiple entities/branches/departments, varied worker types, permission

differences, long names, missing optional fields, historical and future-effective records.

Do not expose the full HRM feature catalogue as one giant menu — everything routes through the

grouped navigation and the single Configuration entry point described above.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a6445f4a-3ea9-4c9f-9dd3-e60b72d0161e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
