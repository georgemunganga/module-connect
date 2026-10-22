# Recurring purchase planning UI integration

Status: source integrated; runtime verification pending. This is not a deployment or completion claim.

## Sources and boundary

- Current Procurement UI candidate: `cf04c05`.
- Recurring UI author branch: `codex/procurement-recurring-ui`, through `cd3802b`.
- Reviewed backend source: ERP recurring author `a80b09b` and existing `ProcurementRecurringPurchaseRoutes`/`RecurringPurchaseCommitmentRules`.
- Existing route `/recurring-bills` retains its URL for compatibility but displays **Recurring purchases**. These are owner-scoped expected purchase schedules. They do not generate bills, liabilities, payments, or Finance postings.
- `recurringPurchaseDraft` remains optional and false unless the server explicitly returns boolean `true`. Existing pages tolerate an older API without it. P23 backend schema/application verification is a separate prerequisite.

## Preserved contracts

Uses shared controls, Core company/default currency and branch headers, canonical worker/account context, permissions and auth epoch, existing supplier/contract APIs, exact string amounts, explicit Draft/Closed status, versioned updates, closure reason and read-only closed records. No employee/company/supplier master is added.

New source guards validate real calendar dates, exact returned identity/status and owned draft values. Create expects version 1. Update requires exact version +1 and all submitted normalized owned fields to match the response. Backend integration must explicitly advance the parent revision for every accepted PUT, including a no-op; the author a80b09b does not yet guarantee this. This prerequisite is being corrected in the separate backend integration. Closure expects exact +1 and saved reason/timestamp. Invalid successful responses are uncertain writes, not success.

## Unconfirmed writes

Before POST/PUT, a session-storage marker is required. Its scope includes tenant, company, worker, branch and the target record (or `new`). It contains only `unconfirmed`, with no draft, money, reason, or document data. A synchronous component latch prevents repeat clicks. Storage failure blocks a write before the request. Only a validated receipt or a definite 4xx rejection clears the marker; unmount, context change, list/detail reload and malformed/network/5xx responses do not clear it.

This is deliberately a conservative browser-session safeguard, not server idempotency or cross-tab exactly-once protection. An uncertain new purchase must be inspected in saved records; the browser session remains blocked rather than silently retrying. Server command-idempotency/recovery receipts remain future work.

## Verification still required

- TypeScript, all relevant unit tests and the production build.
- Playwright recurring CRUD, failed edit read, read-only/closed routes, floating dropdown selection and unconfirmed create reload lock.
- Real PostgreSQL/API CRUD against genuine P23, including exact values, ownership/branch isolation, stale versions, supplier/contract checks and contract concurrency.
- No browser, compiler, test runner, SDK container, migration or deployment was run for this source-only integration while the shared CPU was reserved for the final backend gate. `git diff --check` passed.
