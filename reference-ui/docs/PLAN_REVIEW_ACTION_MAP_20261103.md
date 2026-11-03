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

This is source integration with targeted client verification. Exact merged source `78b0b728e30caf95ef0deda03c4efe1e40d9de2e` passed `tsc --noEmit` and 173/173 tests in six files (readiness 106, Plan API 18, round API 22, scope 15, dates 3, routing 9), with zero failures, skips or TODOs. Checks ran serially with a 512 MiB Node heap, nice 10 and one Vitest worker. Reports: `b1-merge-78b0-typecheck.log`, `b1-merge-78b0-unit.json` and `b1-merge-78b0-unit.log`; the private source binding receipt SHA256 is `8f35fda57e34975a860d14f625e354f0ed23033e67c11970d6a6fb5c6915895d`. These are a distinct post-merge cohort, not a rerun of all historical suites. The combined branch has not been built or browser-tested after this merge. Plan review SDK/migration/native acceptance and paired release remain pending against the backend PR171 successor; the existing B1 acceptance is not Plan workflow evidence.

## Source readiness audit against backend bd4ace99

This follow-up compares existing Plan list/editor/detail/history and shared Approvals controls with backend `bd4ace9998314fb1b9705a7c0e7ed460d5becec0`. It preserves their current layout and shared ERP controls. It does not add plan activation, closure, budget reservation or plan-to-request conversion: those are outside the implemented endpoint set.

Concrete fixes authored after the 173-case merged-source cohort: draft cancellation now applies the same stale/unconfirmed-response block as draft saves, disables another cancellation/edit/submit until the saved record is reviewed, and respects an unresolved review-command journal. Currency stays visible but read-only because Create uses current company currency and Update preserves the original currency. Submitted-version dialogs are keyed by the selected submission, so switching task/history selection cannot reuse another round's evidence state. A focused failure-policy unit regression and an existing-layout cancellation/browser regression are authored. Exact follow-up source `25aa34ab796a8a53a0b7942bad0a4f46d9ed0751` passed app TypeScript, 34/34 focused tests (19 Plan API +15 scope, zero failures/skips/TODOs), and strict standalone TypeScript checking of `tests/e2e/live-plan.spec.ts`. Browser execution remains pending; the earlier 173 cohort is retained separately. Checks ran serially with a 512 MiB heap/nice10/one unit worker, existing dependencies only, after native capture reached its terminal receipt. No build or browser was run. Reports are `cancel-followup-25aa-typecheck.log`, `cancel-followup-25aa-unit.json`, `cancel-followup-25aa-unit.log` and `cancel-followup-25aa-browser-source-typecheck.log`; source binding SHA256 `d165c12c35551071ac6ef33d93c683d4164f0384f96e7c81908cdf78d7a0710d`.

Backend finding reported to Root: immutable round detail currently advertises Withdraw from current plan state without ensuring the requested historical round is current/Pending. A later resubmission may therefore give a closed historical round a false action hint. The command itself rejects the mismatch. The backend owner must correct the hint; the UI continues using authoritative server actions. Privileged non-owner legacy scope-claim discovery is also not provided by the owner-only list/detail endpoints; this UI exposes only actual reachable owner legacy claims and does not invent a broader directory.

## Next actual Core-cookie browser paths

All paths below use the existing production presentation under `/procurement/workspace`. Root must first accept the paired backend migration/schema/native stage, provide a dedicated fresh fixture and approved test-only policy/current independent Core actors, and authorize the command budget. No normal-cookie test has run for this Plan milestone. Real responses and original command keys must be retained; there are no mock business responses, identity aliases, employee prerequisites or automatic POST retries.

| Existing path/control | Actual API and native assertion |
| --- | --- |
| `/plans/new` → Financial period, Need 1, Quantity, Estimated amount → Save draft | `POST /api/procurement/v1/plans`; exact small decimal values; company currency is read-only; detail and reload retain the saved row. |
| `/plans/{planId}` → Send plan for review | `POST /plans/{planId}/review-submissions`, original `Idempotency-Key` and current plan version; successful201 exposes the immutable submitted version. No invented policy when server action is absent. |
| `/plans?view=review` → Review submitted plan, and `/plans?view=review&review={submissionId}` | `GET /plans/review-tasks` supplies verified submissionId; `GET /plans/review-submissions/{submissionId}` supplies immutable submittedSnapshot/current CAS. Assigned reviewer must never depend on owner-only `GET /plans/{planId}`. |
| `/approvals` → Purchase plans tab → Review submitted plan | Same task/detail APIs, with no request/order queue fetch unless that independent queue is permitted/selected. |
| Submitted purchase plan → Mark as reviewed, then independent final actor → Approve plan | Assignment decisions POST uses current plan/case/assignment versions. Server moves Reviewed/Approved; exact submitted values/history survive reload. |
| Submitted purchase plan → Send back → Reason → Confirm decision; maker `/plans/{planId}/edit` | Return decision, current Returned edit PUT and explicit later resubmission; old submittedSnapshot remains unchanged in Review history. Historical closed rounds have no current Withdraw action. |
| Submitted purchase plan → Reject → Reason → Confirm decision | Exact current assignment decision and immutable retained history; edit/submit controls reflect returned server actions. |
| Maker detail → Review history → Open submitted version → Withdraw from review → Withdrawal reason | Withdraw POST requires trimmed nonblank reason up to2000 and current plan/case versions; retained original round/history stay readable. |
| Returned plan detail → Reason → Cancel draft | Existing Cancel endpoint preserves current version guard. A separately authorized ambiguous-response test checks one request only and disabled cancel/edit/submit until reload; do not repeat a real uncertain business command. |
| Existing owner legacy detail → Assign this legacy plan to the selected branch | Claim-scope POST uses explicit permitted branch, retained currency confirmation and current version; canonical camel-case response/original GET recovery. No non-owner directory is fabricated. |
| Maker or reviewer with prepared minimal original-command locator → Check saved result | `GET /plans/commands/{originalKey}` preserves original201/200 while write flag/grants are off; no write lookups or repeat POST. Label any prepared locator fixture honestly; retain cross-actor404/403. |
| Organisation → Company All → owner history/current or assigned task/detail/recovery | Finite authorized GETs retain All header and branch scope; no POST or mutation controls. A real account/branch change clears prior record/drawer evidence. |

READ-off, absent optional metadata, revoked current READ, no policy, inactive/unauthorized reviewer, wrong branch, stale CAS, malformed immutable evidence and unavailable store need separate denied/error-state checks with zero unauthorized writes. This is a bounded Plan milestone; parent issue145 remains open.

Cancellation follow-up review also corrected the parent/child journal notification: claiming a Submit/ClaimScope command refreshes the owner's detail action state immediately, and Cancel rechecks the live journal at click time. This prevents a previously rendered Cancel control from using an earlier unblocked journal snapshot while a review response is unresolved.

## Separate native runner and policy setup gap

The [native positive runner](PLAN_REVIEW_NATIVE_RUNNER_20261103.md) is separate from the mocked Plan browser suite. It covers exactly real cookie owner Create/Submit, reviewer task-by-submissionId with owner GET403, independent FinalApprove and owner history/reload. Private fixture/states and durable assertion IDs stay outside Git. It is source preparation only, pending coordinated typecheck and actual Root private API/browser execution.

Plan review policy configuration is **not yet usable through the current UI**. `policy-key-dispatch.ts` has no Plan label/owner destination; `LivePolicies` permits new/edit/review/publish only for purchase request/order buying-rule JSON; `LiveSettingsShell` has no Plan review editor; and `procurement-policy-api.ts` typed list/effective key unions omit `PROCUREMENT_PLAN_REVIEW`. Existing Plan versions therefore remain generic retained read-only policies and cannot be configured as named Review/Final stages through a live form.

There is also a server prerequisite: at audited backend `bd4ace99`, `ProcurementPolicyDraftRoutes.CheckCompanyRules` has no Plan branch, so SubmitReview/Publish reach generic buying-rule validation and reject a valid Plan schemaVersion2 document. `PlanReviewPolicyRules` already defines exactly two purposes Review/Final with Any/All/Quorum, finite requiredApprovals and independent named Core principal IDs. The existing schema2 `PolicyReviewerPicker` cannot be used unchanged: its sourcing-reviewers endpoint filters `procurement-sourcing-publish`, excluding otherwise eligible Plan reviewers/final approvers.

The smallest next integration should reuse existing module approval settings layout, shared policy list/version/editor/review/publish/return/retirement commands and effective-instant preservation. Add the Plan key's typed dispatch/list/effective mapping; add a typed two-stage editor with user-selected Any/All/Quorum and explicit required approvals (no invented production defaults); generalize the existing Core people picker behind a narrowly authorized purpose/permission-aware Plan lookup using current branch/company and no worker requirement; add the server Plan company/assignee validation dispatch; then validate actual draft→review→independent publish and eligible-name lookup through normal cookies. Configuration grants remain distinct from plan review/approve grants. Do not substitute authority-limit controls, a new approval engine, raw JSON editing or a Root-only fixture for this usability gap. Parent issue145 remains open.

### Policy configuration source successor

The earlier missing-UI audit is now addressed in authored source: [Plan review policy settings](PLAN_REVIEW_POLICY_SETTINGS_20261103.md) mounts Purchase Plans → Approvals in the existing settings shell, adds typed dispatch/key mapping, reuses the current policy lifecycle commands and shared people picker with the new Plan-specific backend lookup. Company-wide Core configuration and assignee scope follow Root/R8's final contract; no branch-specific policy or worker requirement is introduced. This successor passed app/native-harness TypeScript and 60/60 focused policy checks at `ee901f2f`; paired API/native/browser acceptance remains pending; the prior audit describes the defect at its recorded pin, not an accepted deployment.
