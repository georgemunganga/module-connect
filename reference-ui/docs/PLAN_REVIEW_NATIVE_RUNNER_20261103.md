# Native Plan UI positive journey — source preparation

The separate `playwright.plan-native.config.ts` runs only `tests/normal-cookie/plan-review/positive.spec.ts`. It does not run the existing mocked `tests/e2e/live-plan.spec.ts`. This runner is authored source only: no Node, browser, API, database or build execution has occurred for it.

Root must first accept genuine migrations/native admission, create the dedicated private fixture and static/API gateway, approve the resource slot and four business commands, and supply a protected JSON fixture. No data or policy is seeded by this runner. Three independent current Core principals use genuine cookie-only Playwright storage states produced by normal Core login. Worker links are not used for identity or required by the runner. The reviewer must have plan-review-read/review but no plan-read, to prove the owner endpoint403. The final actor needs plan-review-read/approve. This bounded fixture policy has exactly the named reviewer and independent final actor; broader quorum/multiple-approver matrices are separate.

`input.ts` defines the exact fixture type. Required fields are schemaVersion1; purpose `PLAN_REVIEW_NATIVE_POSITIVE`; HTTPS loopback `baseURL` with port; private `databaseName` (`proc_*`, never `erp`) and PostgreSQL system identifier; tenant/company/branch; company currency; exact backend/UI source commits and expiry; expected actual policy id/version/key `PROCUREMENT_PLAN_REVIEW`; and `actors.owner/reviewer/final`, each with real principalId and storageState `{path,sha256}`. Fixture attestations must explicitly confirm accepted migrations/native admission, normal cookies, a fresh Plan fixture, four-command approval, and no business interception or injected identity headers. Fixture/state files must be absolute, regular, nonsymlink mode0600. Storage states contain only loopback cookies and `origins:[]`; they are never committed or copied into reports. Result parent must be a real mode0700 private directory and result must not exist.

After Root's execution approval only, use existing Node22/dependencies and a fresh protected tmpfs profile directory supplied by Root:

```sh
export PLAN_NATIVE_REVIEWED_EXECUTION=1
export PLAN_NATIVE_FIXTURE=/absolute/private/fixture.json
export PLAN_NATIVE_FIXTURE_SHA256=<actual-reviewed-file-hash>
export PLAN_NATIVE_RESULT=/absolute/private/new-result.json
export TMPDIR=/dev/shm/<root-created-mode0700-directory>
python3 reference-ui/scripts/run-plan-native.py
```

The wrapper requires1536 MiB available memory, nice10/512 MiB Node heap, one Playwright worker and zero retries. It performs no fixture/runtime/build setup. Debug/trace/video/screenshots stay off. Config requires the real protected inputs, so do not claim `--list` or type/runtime success by inventing fixture files. A coordinated standalone TypeScript check is still required before actual execution.

The actual UI path is owner `/procurement/workspace/plans/new` → current detail/reload → Send plan for review; reviewer `/plans?view=review` → verified task's submissionId → immutable submitted detail → Mark as reviewed; final `/plans?view=review&review={submissionId}` → Approve plan; owner detail/reload/history → Open submitted version. All mutations use existing buttons/dialogs. API reads independently confirm expected policy id/version, submitted hash and approved history. Reviewer explicitly gets403 from owner-only `GET /plans/{id}` while the reviewer UI must make no such request.

There are exactly four allowed business requests: Create201 (existing legacy draft command), Submit201, Review200 and FinalApprove200. Three governed commands retain actual original keys. Task/record/line/submission/case/assignment/decision IDs come from actual responses; no record IDs are fabricated. Scope headers are ordinary Shell company/branch headers; Core identity comes only from cookies. Route/HAR registration throws; service workers are blocked; requests are passively observed, never fulfilled/rewritten/aborted. Any unexpected/repeated business request or identity-alias header fails the run. No command is automatically retried after a lost response.

A protected result is created before actions and atomically updated after intent/request/response milestones. It contains native assertion IDs, exact command/request/response hashes, statuses, policy/snapshot pins, safe failure step/page errors, and auth logout results. Natural logout revokes the three actor cookies after their last use; Root still reconciles auth cleanup independently. A failed run preserves its report and any real saved rows: do not rerun the fresh flow, reset the DB or issue another Create. Root must reconcile observed commands/rows and authorize a narrow continuation. Successful UI evidence explicitly awaits native owner reconciliation and is not whole Procurement UAT or production acceptance.
