# Recurring purchase planning: UI verification

Date: 22 October 2026 (UTC). Status: **unit, build, controlled-browser and private actual API/database browser gates passed; production release pending**.

The existing Procurement UI is reused with shared ERP controls, branding, navigation and Core account/company/branch scope. Recurring purchases are planning records; they do not create bills, reservations or payments. Finance/AP belongs to the future ERP Finance module.

## Executed evidence

Source `14ffcb45e58751b2386df81c8e84adedbe4a357d` was checked with Node22 and the existing dependency installation. Both `package.json` and `pnpm-lock.yaml` exactly match the accepted P23 dependency manifests. No dependency was added or upgraded.

| Gate | Actual result |
| --- | --- |
| API adapter and uncertain-write lock | 26 Vitest tests passed |
| Live capability/readiness contract | 27 Vitest tests passed |
| Private actor-proxy restrictions | 4 Node tests passed |
| TypeScript and staged production build | Passed; generated route manifest updates four recurring labels from Bill to Purchase |
| Controlled Playwright | Ten cases passed initially. The CRUD case stopped at an ambiguous `Edit` locator matching `Vendor Credits`; an exact link selector fixed the test, and that case then passed separately. One worker, zero retries in both runs. |

The controlled cases cover workerless Core-account CRUD, exact decimal amounts, closure, permission denial, failed edit reads, closed-record edit denial, uncertain delivery, HTTP408/429/499, wrong owner/branch and blocked browser storage. These browser cases use controlled API fixtures and do **not** prove persisted P24 transactions, real SSO, Finance or production deployment.

Private evidence: `/home/amizo/erp-backups/procurement-p24-ui-gate-20261022_1443/`. This retains the first failed trace and screenshot, corrected-case result, logs, source hashes and staged-asset hashes. The initial failure remains recorded; it is not relabelled as an eleven-case passing run. The exact-selector correction changes only the test. Application files and staged assets were not changed or rebuilt for that correction.

## Actual API/database acceptance

UI source `b9f9ff15b97d89db1f89f6234929ed89feb0b0b4` passed both prepared actual Playwright cases in 50.7 seconds, one worker, zero retries and zero skips. The staged assets were exactly the existing build above. Backend/tool source `be5d87e3bfdc2b5d6d6be576ce321173e8c6b9f5` used the genuine private P24 schema and real stored Core permissions.

Create, list/reload, edit, unchanged update, closure, other-owner/branch/current-action denials, exact money and organisation currency were verified against actual mapped API handlers and PostgreSQL. A second test allowed the real API to commit201, then aborted only browser delivery; reload stayed blocked against a second POST and exactly one saved draft remained. This proves the browser guard, not server idempotency or an automatic recovery endpoint.

After graceful shutdown, fresh owning contexts verified exactly two workerless-owned plans: the closed record's versions1/2/3/4 and audit, and the single lost-delivery draft. Pre-existing plans, suppliers, contracts, audit and downstream owners were unchanged. Tracked source, staged assets and the protected fixture hash were unchanged before/after the browser run.

Evidence: `/home/amizo/erp-backups/procurement-p24-actual-browser-20261022_1529/` and backend acceptance `/home/amizo/erp-backups/procurement-p24-recurring-browser-20261022_1526/acceptance.json`, SHA-256 `863f68c97ffbcf2cb35d76895a024d26c8af600e824c6874f9bc172e207a94f7`.

The browser host uses an owner database connection and synthetic outer authentication/Core-shell presentation. A separate actual restricted-login HTTP gate passed; that does not relabel the browser or Core projection as using a finite database role. No production SSO, Finance/AP, payment, scheduler or full-module completion is claimed. Production migration, role reconciliation, paired deployment and live UAT remain separate release work.
