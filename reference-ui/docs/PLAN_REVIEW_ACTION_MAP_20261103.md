# Purchase plan review integration

Frontend source milestone for [ERP issue 172](https://github.com/georgemunganga/erp/issues/172), [workflow issue 169](https://github.com/georgemunganga/erp/issues/169) and [draft backend PR 171](https://github.com/georgemunganga/erp/pull/171). UI base: `1e7922ae178351fa006bdf4a9aaeb44bc903f94e`; reviewed backend contract: `ad969473e08c917283c0ef84133646c3f8671b36`.

This is frontend source integration, not deployment or native acceptance. The backend contract still needs its genuine migration, SDK and native stages. Keep this UI undeployed until the paired backend is verified. No production plan review policy is created here.

## Existing presentation and access

Purchase Plans retains its existing header, list, detail panels, planned-needs table and draft form. My plans and To review reuse those shared controls; the existing Approvals selector adds Purchase plans. Submitted evidence opens in the shared modal, with shared tables, timeline and approval decision dialog. It does not replace the imported shell or create another product. Visual parity has not yet been browser-verified for this change.

`planReviewRead` and `planReviewWorkflow` are optional metadata fields: only literal `true` enables either. Existing `planningDraft` and draft create/edit grants remain independent, including on older backends without the new fields. The review queue requires current `procurement-plan-review-read`; request, order and invoice queues retain their own admission and only the selected eligible queue mounts. A plan-only reviewer therefore does not mount the request queue or its HTTP effect.

Review actions require full workflow capability, current named permission, an explicit permitted selected branch, server `allowedActions` and current scope. Company All supports scoped retained reads; writes are closed. Core principal identity is used directly; no employee is required. Actor/auth/company/branch/permission/capability changes remount the plan surface, discard old record data and reject late scoped responses.

## Action and contract map

All paths below begin `/api/procurement/v1/plans`. Current server authorization, owning state, validation and audit remain authoritative.

| UI surface/action | HTTP contract | Admission and result |
| --- | --- | --- |
| My plans / current detail | GET `/`, `/{id}` | Existing own-plan READ; current mutable draft is not reviewer evidence. |
| New / edit / cancel draft or returned plan | POST `/`; PUT `/{id}` `{version,draft}`; POST `/{id}/cancel` `{version,reason}` | Existing planningDraft/create or edit permission, state/CAS and optional server Edit/Cancel hints. Returned plans use server hints; old backend fallback permits Draft only. No review policy is required for draft CRUD. These existing endpoints have no command-receipt contract; this change does not invent one. |
| To review / Approvals task | GET `/review-tasks` | Read capability plus review-read; verified task `submissionId` opens immutable round. `caseId` is separate and never guessed as a submission. Invalid task shape fails closed. |
| Historical owner rounds | GET `/{id}/review-history` | Current own-plan READ and retained-read capability; each actual round ID opens the retained snapshot. |
| Submitted round detail | GET `/review-submissions/{submissionId}` | Current owner READ or assigned reviewer READ, as verified by server. Uses `submittedSnapshot` exclusively for submitted lines/money; never falls back to owner-only GET or mutable lines. |
| Send plan for review | POST `/{id}/review-submissions` `{expectedPlanVersion}` | Workflow, submit grant, server Submit hint; server validates policy/state and pins the immutable snapshot. Original result HTTP 201 retained. |
| Review / final approve / send back / reject | POST `/review-submissions/{submissionId}/assignments/{assignmentId}/decisions` | Current Review or Final assignment, corresponding review/approve grant and server action hint; `{action,reason,expectedPlanVersion,expectedCaseVersion,expectedAssignmentVersion}`. Return/Reject need a reason. |
| Withdraw | POST `/review-submissions/{submissionId}/withdrawals` | Owner withdraw grant and server hint; current plan/case CAS and a required trimmed reason of 1–2,000 characters. Open the current history round first. |
| Assign legacy branch | POST `/{id}/claim-scope` | Explicit selected branch, edit or claim-scope-all grant, server ClaimScope hint; `{version,confirmStoredCurrencyCode,reason}`. Confirms the stored currency without conversion. |
| Check previous review action | GET `/commands/{key}` | Current retained READ and original actor/scope. No writer lookups, new key, replay POST or workflow capability needed. Exact original response status is retained. |

Every new review/claim command uses `Idempotency-Key`. Before POST, the client journals only the locator (key, operation, plan/submission/assignment IDs), partitioned by original principal/company/branch/auth context and browser tab. It stores no estimates, reason or command body. Pending/unknown results block another review command; only a bound original GET result clears the locator. A lost response, stale conflict or scope change never starts an automatic new-key POST. Draft saves retain their existing stale/unknown-result blocking and require review of saved records before another save.

The submitted version is evidence, not the decision CAS. Decisions always use current `planVersion`, `caseVersion` and assignment `version` from round detail. Historical snapshot identity/company/branch/version/currency, line IDs and line numbers, amounts and exact sum are validated; the server verifies the retained snapshot seal. The browser does not claim to independently recompute that cryptographic seal.

Exact decimal tokens are decoded before JSON.parse can round numeric18,4. Draft fields and submitted amounts remain decimal strings; draft numeric JSON wire fields are emitted from validated exact strings. Totals use scaled BigInt and existing exact budget formatting. No Number conversion of money is used.

## Verification and remaining stages

Node `v22.23.3`, existing dependency symlink, one worker, `nice -n 10`, `NODE_OPTIONS=--max-old-space-size=512`. No package installation, SDK, runtime or database changes.

- `./node_modules/.bin/tsc --noEmit`: passed (`typecheck-02.log`).
- Vitest final cohort: 192 passed in eight files, zero failed/skipped/todo (`unit-final.json`, `unit-final.log`). Files: `plan-review-api.test.ts` (16), `procurement-live.test.ts` (99), `procurement-scope.test.ts` (15), `organisation-access.test.ts` (11), `verified-organisation-context.test.ts` (13), `manual-payment-command.test.ts` (21), `manual-payment-api.test.ts` (15), `manual-payment-view.test.ts` (2).
- Separate existing `manual-payment-policy-editor.test.ts`: 3 passed, zero failed/skipped/todo (`policy-compat.json`, `policy-compat.log`). Total 195 in nine files. The prior payment eight-file172 cohort is preserved by file definition; seven added readiness cases make its current count179, plus16 new plan cases195. This is not a claim that every repository test ran.
- New cases cover missing/nonboolean metadata, independent READ/write-off, exact decimal limits, older draft DTOs, verified reviewer-safe URLs, missing task submission IDs, current CAS versus historical version, invalid snapshot bindings, Company All write denial, current actor changes, permissions/action hints and original201 GET recovery after an unknown POST with no repeated POST.

Logs/report artifacts remain outside Git in the scoped UI evidence directory. Typecheck emits no TRX; Vitest JSON is the machine-readable report. A source/commit binding accompanies the draft PR review. No build manifest exists for this source milestone because build/browser slots have not been authorized. Existing `tests/e2e/live-plan.spec.ts` remains the draft CRUD/stale/denied compatibility journey, unrun for this change. Next stages: controlled live build; one-worker mocked UI regressions including plan-only Approvals/immutable detail/actions/recovery; then genuine backend migration/native acceptance and actual normal Core-cookie UI acceptance. No signed-in UAT, persistence, deployment or hosted CI success is claimed here.

### Independent contract-review followup

The final API contract pin above supersedes the initial `ba67e5fdfc4c1e63ffad7786efcccc0e001acf1e`. It makes legacy scope-claim receipts canonical camel-case and adds narrow Company All review GET admission plus raw-All write denial. Those are backend source corrections, still pending its SDK/native acceptance; no UI fallback to a first branch or Pascal-case receipt was introduced.

Withdrawal now requires a trimmed nonblank reason of at most 2,000 characters in the shared command builder, required field, disabled confirmation and execution guard. The changed plan contract file was rerun: 18 passed, zero failures/skips/todo (`review-followup-unit.json` / `.log`), including whitespace/oversize denial, exact trimmed request/current CAS and camel-case claim POST/original-key GET receipts. Final `tsc --noEmit` passed (`typecheck-review-followup.log`). The earlier full195 result is retained as the initial source cohort; it was not rerun or represented as a new197-case full run. Build/browser/native stages remain pending.


### Actual Shell All representation correction

A real RFQ browser transition established that the Core shell stores All as `branch:""` plus `branchScope:"all"`. The Plan review hook had the same proven nullish-coalescing defect: `?? null` retained the empty string and the strict identity capture rejected it. This branch now uses the shared shell-to-identity normalizer, preserving nonempty GUID validation and translating only the shell's absent/empty branch representation to null. Layout, permissions, write guards, snapshot evidence and API contracts are unchanged.

The focused regression starts from that actual Shell selection shape, reads retained evidence with the explicit All header and proves no review POST is sent. Plan contract18 plus existing scope15 passed33/33; `tsc --noEmit` passed at heap512/nice10. Reports `all-identity-followup-unit.json` and `all-identity-followup-typecheck.log` remain outside Git with a source binding. Earlier195/18 cohorts are retained, not represented as rerun. No new build, migration, Plan native browser acceptance or deployment occurred; the separate B1 browser continuation is not Plan workflow evidence.

## Source integration after B1 merge

PR103 now merges published UI main `9b5d02dcf971900289793f56e91895dd3747fd80` without rewriting its published history. The original Plan and RFQ layouts coexist. Metadata retains independent, optional/default-false Plan review and round-plan capabilities. The live gate retains B1/quotation route-specific All admission alongside Plan review reads, and both identity hooks reuse the single shared empty-branch normalization helper. B1 product code and its tests/harness remain unchanged by this merge.

This is source integration only. The combined branch has not been built or browser-tested after this merge; targeted TypeScript/client checks await Root's resource slot. Plan review SDK/migration/native acceptance and paired release remain pending against the backend PR171 successor; the existing B1 acceptance is not Plan workflow evidence.
