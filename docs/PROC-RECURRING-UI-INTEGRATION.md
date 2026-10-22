# Recurring purchase planning UI integration

Status: source integrated; runtime verification pending. This is not a deployment or completion claim.

## Sources and boundary

- Integrated system-user/timeout UI baseline: `9504028`; separately prepared Core picker source: `6026ace`.
- Recurring UI author branch: `codex/procurement-recurring-ui`, through `cd3802b`.
- Reviewed backend source: ERP recurring author `a80b09b` and existing `ProcurementRecurringPurchaseRoutes`/`RecurringPurchaseCommitmentRules`.
- Existing route `/recurring-bills` retains its URL for compatibility but displays **Recurring purchases**. These are owner-scoped expected purchase schedules. They do not generate bills, liabilities, payments, or Finance postings.
- `recurringPurchaseDraft` remains optional and false unless the server explicitly returns boolean `true`. Existing pages tolerate an older API without it. A genuine generated recurring/identity schema and backend application verification are separate prerequisites.

## Preserved contracts

Uses shared controls, Core company/default currency and branch headers, canonical Core system-principal context with an optional employee projection, permissions and auth epoch, existing supplier/contract APIs, exact string amounts, explicit Draft/Closed status, versioned updates, closure reason and read-only closed records. No employee/company/supplier master is added.

New source guards validate real calendar dates, exact returned identity/status and owned draft values. Create expects version 1. Update requires exact version +1 and all submitted normalized owned fields to match the response. Backend integration must explicitly advance the parent revision for every accepted PUT, including a no-op; the author a80b09b does not yet guarantee this. This prerequisite is being corrected in the separate backend integration. Closure expects exact +1 and saved reason/timestamp. Invalid successful responses are uncertain writes, not success.

## Unconfirmed writes

Before POST/PUT, a session-storage marker is required. Its scope includes tenant, company, system principal, branch and the target record (or `new`). It contains only `unconfirmed`, with no draft, money, reason, or document data. A synchronous component latch prevents repeat clicks. Storage failure blocks a write before the request. Only a validated receipt or an explicitly known rejection (HTTP 400, 401, 403, 404, 409 or 422) clears the marker; unmount, context change, list/detail reload and malformed/network/408/429/499/5xx or any other unrecognized responses do not clear it.

This is deliberately a conservative browser-session safeguard, not server idempotency or cross-tab exactly-once protection. An uncertain new purchase must be inspected in saved records; the browser session remains blocked rather than silently retrying. Server command-idempotency/recovery receipts remain future work.

## Verification still required

- TypeScript, all relevant unit tests and the production build.
- Playwright recurring CRUD, failed edit read, read-only/closed routes, floating dropdown selection and unconfirmed create reload lock.
- Real PostgreSQL/API CRUD against the genuine generated recurring/identity schema, including exact values, ownership/branch isolation, stale versions, supplier/contract checks and contract concurrency.
- No browser, compiler, test runner, SDK container, migration or deployment was run for this source-only integration while the shared CPU was reserved for the final backend gate. `git diff --check` passed.

## Core system-user ownership correction (source only)

Reviewed ERP backend contract source: `c4f65f2` on `codex/procurement-recurring-core-principal` (schema/runtime gates pending). Its detail DTO and assignment/close code were inspected.

The updated backend contract requires `ownerPrincipalId` (the actual stable Core account UUID) and permits `ownerWorkerId: null`. CRUD permission checks no longer require an employee or derive a read-only mode from missing employees. Journal keys use the acting Core principal. Owner details display **You**, without exposing an employee UUID. List/detail/editor reads and mutation acknowledgments must match the current acting principal before displaying data or clearing a pending marker.

Accepted update and close responses still require exactly the next revision; the backend integration must advance even no-op PUTs. Missing/foreign owner principals, wrong revisions/states/fields and unrecognized HTTP outcomes remain unconfirmed. Tests now exercise the full mocked CRUD journey with a Core principal and no employee, plus wrong-owner acknowledgment locking across reload. No backend identity is synthesized, and no Finance bill is generated.

This source branch includes unverified Core picker and recurring changes. Existing proof for the earlier `36127ad` application is not proof for this branch. Unit, compiler, browser and real PostgreSQL gates remain pending; no heavy verification or schema operation was started while the backend SDK held the CPU slot.

## Current P23/P24 alignment checkpoint

The latest isolated branch starts at P23 policy UI `ae54ca8`, which includes published main
`8b98080` and its deployed branch-name canonicalization/fallback. It ports the existing recurring
UI and its already-authored receipt/journal/Core-principal safeguards, rather than introducing
another interface. The capability merge preserves all current P23, comparison and sourcing flags;
`recurringPurchaseDraft` is still optional and false unless the real server explicitly enables it.

Backend `dd1b719` prepares the recurring-only successor on integrated P23 `dbf5107`. This actual
contract requires a genuine Core owner, nullable employee metadata and exact +1 PUT/close CAS,
including no-op saves. New response checks also refuse nonzero-UUID violations, incoherent saved
schedules, duplicate/oversized lists and a returned record from another explicitly selected branch
before a write marker can clear. Unknown markers survive reload and context changes; no fake
record, tax/bill line, bulk import, recurring scheduler or payment effect is introduced.

Additional authored unit cases cover selected-branch receipt binding, malformed schedules and list
shapes; browser cases check every Procurement request's real selected-company/branch headers,
wrong-branch acknowledgments across reload and denied storage before POST. Existing workerless
Core CRUD, no permission, closed-history, exact amounts and HTTP408/429/499 unknown-outcome cases
remain. All checks are SOURCE ONLY and unexecuted while the backend SDK owns the CPU slot.

P24 generation/provider verification and the genuine scoped CRUD/browser fixture remain separate
release prerequisites. These source changes do not inherit the deployed hotfix's runtime proof.
