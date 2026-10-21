# Manus collaboration handoff

**Updated:** 21 October 2026 (UTC)  
**Coordinator:** primary Codex agent  
**Worker:** Manus, on a separate computer and GitHub account  
**Current milestone:** `MANUS-PROC-VENDOR-01` — live vendor UI integration and save/context safety  
**Tracking issue:** [module-connect #40](https://github.com/georgemunganga/module-connect/issues/40)  
**Progress file:** [docs/collaboration/manus/STATUS.md](docs/collaboration/manus/STATUS.md)

## Read this first

This is the persistent coordination entry point on the default branch. The implementation baseline is the feature branch named below, **not this older default-branch application snapshot**. Read the latest copy of this handoff on `origin/main` before starting, even when working on a feature branch. Do not merge all of main's application files over the implementation branch to obtain this document.

The user has authorized parallel implementation and GitHub collaboration. Use your own branch and commits. Read `AGENTS.md`, the baseline branch's `reference-ui/UI_COMPONENT_STANDARD.md`, and the ERP repository's `docs/engineering/GW-ENG-STD-001.md`. Preserve published history: no force pushes, amendments of published commits, or rebases of published branches.

## Claim, execute, and report

1. Comment on issue #40: milestone ID, your GitHub handle, work branch, starting commit and the files you will own. Check for an existing active claim before editing. Claim only this milestone; do not take unrelated work automatically.
2. Create your branch from the implementation baseline below. If either baseline is unavailable, record the exact missing dependency in the issue; do not implement against guessed API contracts.
3. Use the checklist below and the linked engineering/UI standards. Keep backend deficiencies explicit. The primary agent continues backend sourcing/policy/migration work; these files are outside your scope.
4. Push focused commits and open a **draft PR against `codex/procurement-sourcing-policy-ui`**, referencing issue #40 and `MANUS-PROC-VENDOR-01`. If that base changes, coordinate on the issue first. Do not target an unrelated older main application snapshot.
5. Use the issue comments for immediate progress and blockers. Add a progress entry to your own `docs/collaboration/manus/STATUS.md` on your branch using the template below, and include it in the PR. Copy this small handoff/status document from main if the baseline predates it; do not import unrelated main code.
6. Record exact test commands, commit under test, counts, failures, traces, and whether HTTP was mocked or actual. `PR ready` means ready for independent review; it does not mean merged, deployed, or accepted.
7. Do not merge PRs, deploy, alter production records, run production migrations, change credentials, or activate missing backend capabilities. The primary agent reviews source, runs the relevant integration/Playwright checks, resolves overlap, and records accepted/merged commit IDs.
8. After this milestone is submitted, wait for review or a new assigned row. Do not start another module based on an assumption.

## Work allocation

| Milestone | Owner | State | Scope | Integration destination |
| --- | --- | --- | --- | --- |
| `MANUS-PROC-VENDOR-01` | Manus — claim in issue #40 | Ready for claim | Vendor-specific frontend integration and safety/tests | Draft frontend PR to `codex/procurement-sourcing-policy-ui` |
| Sourcing policy identities, P29 schema/readiness and actual API/PG proofs | Primary agent and its existing backend agents | In progress | Backend Procurement/Core and sourcing policy files | Existing ERP integration branch/PR #8 |
| Additional Manus milestones | Unassigned | Await coordinator assignment | No work authorized by this row alone | To be specified |

## Shared constraints

- Organization is the legal entity; use the selected organization's default currency. No invented business thresholds, supplier approval rules, tax rates, finance balances or unrestricted permissions.
- Keep existing ERP branding, reusable controls, navigation and workflow features. Do not build a competing UI system or duplicate Core identity, permissions, configuration, audit, imports/exports or notification infrastructure.
- UI visibility is not authorization. Server responses and scoped backend rules remain authoritative.
- Never treat demo/local browser state, mock responses, API acceptance or a screenshot alone as proof of persisted production integration.
- Keep secrets, real personal/financial data, credentials, tokens and private environment files out of commits, issues, logs and screenshots.
- Do not edit files owned by another active milestone. Explain proposed shared/backend changes on the issue before making them.

## Current assignment

## Assignment: complete and verify the live Procurement vendor UI

Work independently while the primary agent completes sourcing backend integration. Open a draft PR for review; do not merge or deploy.

### Repository and branch

- Frontend: https://github.com/georgemunganga/module-connect
- Start from `codex/procurement-sourcing-policy-ui`, checkpoint `eaca0d1` or its descendant. Create your own branch, for example `manus/procurement-vendor-integration`.
- Backend contracts, read only: https://github.com/georgemunganga/erp, branch `codex/procurement-rfq-finance-identity-integration`, checkpoint `315380e` or its descendant. Inspect actual Procurement vendor routes and DTOs before wiring fields. Report missing backend contracts in the PR; do not manufacture success or invent endpoints.
- Read applicable AGENTS.md and the existing UI component standard. Preserve existing user work.

### Owned files and boundaries

Own `reference-ui/src/features/LiveVendors.tsx`, vendor-specific helpers/tests, and `src/platform/procurement-vendors-api.ts` where needed. You may reuse existing vendor form components. Do not edit sourcing policies, reviewer selection, RFQ, budgets, shared navigation/branding, Core settings, authentication, global components, database migrations or backend business rules. List any necessary shared change separately for review.

### Required work

1. Audit the existing live vendor list, create, edit, detail, contacts, addresses/sites, qualification and approval/suspension flows against actual backend contracts. Finish available integrations and preserve existing functions. Reuse the imported vendor form layout/tabs and ERP components; do not replace this with a new design or remove fields.
2. Keep simple language, established font/spacing/buttons, floating selects and boolean toggles. Use the existing shared table and centered no-data state. An empty vendor list must offer Add vendor when authorized; only offer Import if a genuine supported import path exists.
3. Fix concrete save safety: edit mode must never fall back to `createVendorDraft` when its version/detail is unavailable. Block save until the exact current vendor/version has loaded. Load or permission failure must not turn an edit into a create.
4. Prevent old detail/list/contact responses or pending mutations from populating another company or account context. Cancel requests and guard stale completions. Preserve form values on an ordinary validation/authorization failure. Never send another company's ID/version/fields in a write.
5. Default currency from organization settings. Preserve fields the editor does not own; do not send empty placeholders that erase existing data. Match real DTOs, lengths, required fields and optimistic versions. Do not put banking secrets in logs, screenshots or browser storage.
6. Handle a lost response honestly. If no backend idempotency/recovery contract exists, do not invent one or automatically repeat a create/update. Explain the unconfirmed result, block duplicate saves, and provide an explicit read-only reconciliation path. A same-name vendor is not proof of the original write.
7. Respect actual server-provided allowed actions and permissions. A portal request does not activate supplier login. Procurement must not approve bank details or execute payments. Do not label mocked/unsupported functions as connected.

### Verification and PR evidence

- Run TypeScript, relevant unit tests and the live-mode production build with the existing package manager and unchanged lockfile unless a justified dependency change is required.
- Add meaningful Playwright coverage on the existing live vendor routes: empty/create/refresh/edit round trip; a load failure cannot create; validation preserves values; stale-version conflict; denied action; company switch during a delayed response; double-click/lost response produces no second mutation; contact/site flows where supported.
- Separate mocked HTTP tests from actual backend tests explicitly. If actual backend access is unavailable, provide precise mocked contract evidence and mark actual persistence/integration unverified. No production credentials or production test writes.
- Use one browser worker and no retries for acceptance evidence; keep failed traces. Report exact commands, source commit, passed/failed counts and limitations. Do not claim the entire Procurement module is complete.
- Keep commits focused and reference this issue. Open a draft PR with a short workflow checklist, screenshots using synthetic data, and an inventory of remaining API gaps. The primary agent will independently review and test before merge.
