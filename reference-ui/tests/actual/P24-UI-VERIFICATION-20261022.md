# Recurring purchase planning: UI verification

Date: 22 October 2026 (UTC). Status: **unit, build and controlled-browser gates passed; actual P24 API/database browser acceptance pending**.

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

## Remaining acceptance

Run the prepared actual recurring-purchase Playwright cases against the genuine private P24 schema and current Core permissions. Independently verify saved rows, audit, exact values, scope denials, version changes, closure and lost delivery. An owner-connected browser fixture must remain labelled as such; restricted database-role HTTP acceptance is a separate proof. Do not enable production or claim full Procurement completion from these UI gates.
