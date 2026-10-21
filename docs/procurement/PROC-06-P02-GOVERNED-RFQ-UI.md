# PROC-06 P02 — Existing sourcing UI adapter

Source-only candidate, based on invoice UI0420489. Backend contract: RFQ discovery e0818e1/6f031fd plus eligible branchRef12c0447, governed draft adapter bb1e987. Not built, tested, enabled or deployed. Tracking module-connect#5; release hold#29 applies. Earlier exact invoice verification does not certify this new candidate.

## 1. Feature Identification

Governed RFQ draft adapter within existing LiveSourcing list/new/detail routes.

## 2. Purpose & Business Outcome

Prepare internal quote requests from approved demand, including partial quantities and multiple PRs, without losing ad hoc drafting.

## 3. Scope & Exclusions

Own draft list/detail, approved-demand picker, explicit Create/Cancel and original receipt recovery. No publication, supplier dispatch/invitation, bidding, evaluation, award, PO conversion, payable or payment authority.

## 4. Parent & Related Features

Same existing sourcing child feature and routes. Backend 28-section discovery/governed adapter is authoritative; this document maps the screen/client boundary.

## 5. Actors & Participants

Current Core convert or cancel grant for governed discovery/detail. Create requires convert; cancel requires cancel. Capability alone never substitutes for an action permission.

## 6. Entry Points & Triggers

Existing `/rfqs` list has approved-request/ad-hoc choices when governed capability+action permit. Governed URLs use `?source=approved`; `/rfqs/new?source=approved` creates; `/rfqs/{id}?source=approved` reads/cancels. No new route page/menu.

## 7. Preconditions

Optional `sourcingSourceDrafts` resolves true only for an explicit boolean true. Missing/string/false resolves false; legacy `sourcingDraft` unchanged. Existing live gate and verified Core scope remain; server execution readiness/default-Unavailable unchanged.

## 8. Workflow

Open approved-request list → new draft → GET approved source candidates → add one or more lines → adjust exact quantities → explicit Create → actual owned detail. Cancel requires reason/CAS; quantities are released only after server command succeeds. Reads never reserve quantities. Unknown save result retains original operation/key and offers GET receipt recovery only.

## 9. Status / State Transitions

Server Draft/Cancelled and Reserved/Released only. UI Available/FullyAllocated/Unavailable are preview facts. Loading, empty, validation, denied, unavailable and ambiguous-save states are explicit; no optimistic terminal transition.

## 10. Permissions & Data Scope

Server enforces current canonical principal/tenant/company/selected branch. UI checks exact convert/cancel actions, remounts whole sourcing subtree on reactive tenant/entity/branch/worker/permissions/capability changes, and discards old selected/detail state. Branch membership and department selections are never inferred as grants.

## 11. Business Rules

Client checks exact common branchRef and currency (including explicit null branch, never guessed from shell), duplicate lines, per-request consistent CAS, 200-line bound and exact remaining quantity. Create revalidates current source/catalog/Finance/policy/complete allocation ledger. Client does not copy the backend allocation reducer or invent monetary thresholds.

## 12. Data Fields & Ownership

Governed original quantities/approved unit estimates/estimated values are exact strings; input validation reuses existing BigInt decimal helper. No Number/toFixed financial coercion. Request/event/method CAS must be safe integer numbers; unsafe values fail closed. Eligible branchRef key is mandatory; failed-proof rows omit it and expose no money/private owner properties. Legacy ad hoc transport unchanged in this slice.

## 13. Screens & Data Views

Existing LiveSourcing wrappers retain ad hoc list/editor/detail. Add governed list, picker and detail as feature components using existing shared controls, table, panels and shell. Governed drafts deliberately have no edit/publication button.

## 14. User Experience / Human Behaviour

Plain labels: From approved requests, Ad hoc drafts, Add line, Available, Needs review, Create internal draft. Explain that source candidate count includes blocked/assigned lines. Refresh source previews clears selections; changing pages/search preserves deliberate multi-PR selection until source refresh or context change.

## 15. Notifications & Communications

No client-side vendor messages or notification effects. No success before validated server result.

## 16. Documents & Attachments

No document input or raw evidence display in this bounded flow. Existing unrelated screens remain unchanged.

## 17. Exceptions & Edge Cases

Mixed branch/currency, duplicate sources, over-quantity, >4-place quantity, stale/unsafe CAS, malformed DTO, missing grouping branch and unexpected publication flags fail closed. Known request validation error may return to editing; ambiguous responses retain key and freeze mutation surface. Auth/object denials clear loaded governed detail/source state.

## 18. Integrations / APIs / Events / Sandbox

Typed purpose GETs `/sourcing/approved-sources`, `/source-drafts`, `/{id}/source-draft`; POST `/from-approved-sources` and `/{id}/source-cancel`; GET `/command-receipts/{Create|Cancel}/{key}`. Scope headers captured before fetch; UUID Idempotency-Key retained. Receipt recovery validates exact operation/key/original target/status/fingerprint/version and returns recorded history, not current commercial eligibility.

## 19. Audit / Security / Privacy

Server owns durable audit/outbox/receipts. Client responses are shaped to known fields; failed proof discards private/money fields. No raw error body/evidence payload rendering or browser-local transaction claim. No new localStorage transaction persistence or credentials.

## 20. Reports / Dashboards / Metrics

CandidateTotal is not eligible count. Owned total is server-scoped before paging; no fabricated company-wide totals.

## 21. Configuration & Localization

Shared ERP typography/colors/components unchanged. Exact decimal display reuses existing string grouping helper; no locale Number conversion. Currency remains approved source currency, not editable free input in governed form.

## 22. Non-Functional Requirements

Bounded search/pages, cancellation of stale GETs and context remount. Abort/unmount does not undo server commands; old-context completion does not navigate a newer context. No duplicated data grids/design system.

## 23. Postconditions

Successful Create navigates to server-owned event; successful Cancel reloads authoritative detail. No implied supplier delivery or Finance balance change.

## 24. Failure & Recovery

Interrupted/invalid/unconfirmed command responses offer GET recovery under same original operation/key. No automatic POST retry/new key. Recovery may return recorded earlier version; UI then reloads current detail. Unresolved commands remain visibly unconfirmed; refresh/context change clears local surface and server authorization still applies.

## 25. Acceptance Criteria

Exact wide4dp quantities survive input/body/response; partial multi-PR drafts use one exact branch/currency; no hold before explicit Create; original lost-response key recovers via GET without duplicate POST; cancel reason/version/fingerprint required; legacy remains accessible with older API; scope switch clears old data; no publish/payment action becomes ready.

## 26. Test Scenarios

Authored, unrun: 10 typed-client cases (exact strings/search, grouping/CAS, failed-proof privacy, no transport before Create, mixed/duplicate sources, consolidation, GET recovery, retained history/no publication, cancel target/version binding, bounded input/invalid detail), one metadata case plus absent capability assertion; five mocked-browser cases (exact partial consolidation+cancel, lost Create recovery, absent capability+legacy preservation, reactive branch clearing, missing action denial). Browser mocks are not live Core/Finance/PG proof. Required next gates: bounded client/readiness tests, TSC/build, these five transport mock cases, existing relevant sourcing/invoice regressions, then actual finite-role RFQ server/migration/browser/owner verification after backend readiness is available. No tests executed by author.

## 27. Ownership / Dependencies

Frontend owns presentation/typed transport. Procurement owns draft/source/reservation invariants; Core owns identity/scope/cases; Finance remains external authority. Exact backend additive branchRef12c0447 is a required consumer contract. No new identity, approval, ledger or readiness provider.

## 28. Open Decisions / Assumptions

Backend governed RFQ schema readiness and actual PG verification remain pending; default-off capability means source-only UI cannot activate live workflow. Exact archive/reload recovery UX for commands after a full browser reload remains outside this in-memory adapter; server receipt persists and no auto retry occurs. Award-to-PO transfer and source amendments are separate contracts. No production release claim.

### Distinct source review follow-up — cancellation outcome classification

After a definite cancellation400/422 validation rejection, clear only the prepared pending command and retain current reason/record for correction. A later user submission receives a new UUID. Transport interruption/5xx remains unconfirmed with its original UUID. A recovery404 does not prove absence or release permission: keep the original pending command and offer GET-only recovery; clear the current detail rather than expose a stale action.

A sixth focused transport-mock browser case is authored (unrun): first cancellation422 leaves reason editable; second explicit cancellation has a new key but loses its response after recording; first receipt GET404 keeps the original second key and no cancel POST button; second GET with that same Cancel/key recovers the recorded200 response and reloads authoritative Cancelled detail. Assert exactly two POSTs total and two recovery GETs with identical original second key. Existing five cases are retained, with no broader test duplication. Source-only, no Node/build/browser execution or deployment.

### Prepared serialized frontend gates (not executed)

Coordinator must first clear the single host slot, verify port3043 is free, choose a fresh private evidence directory and retain prior artifacts. Use cached Node22/packages, heap512, one worker; stop at first failure. Run from `reference-ui` in the frozen RFQ worktree, with `NODE_OPTIONS=--max-old-space-size=512` and `CI=1`. Each invocation is sequential with `set -o pipefail` and its own retained log; do not overwrite existing `.rfq-verification-dist` or `.rfq-test-results`.

```sh
node node_modules/vitest/vitest.mjs run tests/rfq-execution-contract.test.ts src/lib/procurement-live.test.ts src/lib/procurement-scope.test.ts --pool=forks --maxWorkers=1 --minWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
node scripts/generate-routes.mjs
VITE_PROCUREMENT_LIVE_MODE=1 node node_modules/vite/bin/vite.js build --outDir .rfq-verification-dist
node node_modules/@playwright/test/cli.js test --config playwright.rfq.config.ts --workers=1 --max-failures=1 --reporter=line
```

The RFQ config selects exactly six new governed transport cases plus three existing ad hoc regression cases, with isolated port3043/output directories. Retain source SHA, logs, browser traces/screenshots and artifact SHA256 after the build. Actual backend RFQ/PG/browser proof remains a separate pending milestone; a mock pass cannot enable production readiness.


### First central frontend gate — partial pass, retained browser failure

Application source7196a41, session28763: **28/28** focused contract/readiness/scope tests passed (10new RFQ +14scope +4metadata), TypeScript noEmit passed, route generation remained clean and dedicated candidate build passed (1,760modules,41.10seconds). Built JSindex-8RiYc3Ex and CSSindex-Bddc462I; normal large-chunk advisory retained. Private evidence and frozen asset hashes: `/home/amizo/erp-backups/procurement-rfq-ui-20261020_190214`.

The9-case transport browser gate stopped at its configured first failure: **5 passed,1 failed,3 did not run**,53.8seconds, process exit1. Sixth-case exact getByLabel('Reason') could not find the textarea after422, although the retained screenshot/accessibility snapshot show textbox Reason with the original value and editable cancellation action. No passing cancellation recovery is inferred. Preserve the failed trace/results before diagnosis; do not weaken the original-key, GET-only and no-repeat-POST assertions. Full actual business API/PostgreSQL proof and deployment remain pending.


Distinct trace/source diagnosis confirmed the cancellation value/action was retained. The implicit label's textContent includes the controlled textarea child text after rerender, while its computed accessible name remains Reason. Test-only correction uses getByRole(textbox,name:Reason,exact:true) for the four Reason queries. It preserves exact-value, new-explicit-key, lost-response, recovery404, same-key GET and exact POST-count assertions; no UI behavior, timeout or retry changes. Rerun the full9 mock browser cases against the same frozen7196a41 assets after the backend job clears the host slot. Previous failure and3 unrun cases remain recorded; no rerun result is inferred.

### G29 financial-string compatibility correction — source only

Backend ProcurementEvidenceEncoding.Decimal intentionally retains its established G29 wire/hash representation: a genuine8dp estimatedValue can be `"1E-08"`. The earlier decimal-only RFQ projection regex rejected this otherwise-valid detail. This bounded follow-up changes only the frontend RFQ projection: existing invoiceDecimal18,4 normalizes available quantity, positive detail quantity and approved unit estimate; existing boundedNonnegativeDecimal38,8 normalizes calculated estimatedValue. No new parser, financial Number conversion, global formatter/hash/codec change or UI redesign. Normalized DTO strings reach existing formatters. Legitimate zero estimates/calculated values and FullyAllocated zero balance remain valid; zero active quantities/Available zero balance, negative values, excessive precision/exponents and JSON financial numbers fail closed.

Authored/unrun regressions: three positive/zero normalization client cases plus10 invalid original/calculated financial cases, retaining all prior identity/scope/CAS/commands/recovery checks. Five new transport-browser cases: genuine G29 detail with explicit small source Create and interrupted Cancel/GET recovery; four zero/negative/overprecision/unsafe-numeric source/detail cases, each zero POSTs. Existing six governed+three ad hoc scenarios remain. Frozen Budget/RFQ assets and their earlier verification evidence remain untouched; this new source requires its own focused unit/TSC/build/browser gate. Backend original full P28 gate's failure is retained separately, not relabeled as a pass by this source correction.


## G29 projection regression acceptance —21October2026

Applicationda00853:67/67 focused tests (23RFQ,10Budget,20invoice exact,14scope), TypeScript and live-mode production build passed. New candidate14/14 Chromium mocked API browser cases passed, zero retries,36.4seconds. Includes genuine server-spelled string1E-08 normalization/display plus controlled cancellation recovery and zero/negative/overprecision/unsafe-number cases without POST. Existing legacy draft cases remain covered. No financial Number conversion or global backend G29/hash change.

Protected evidence /home/amizo/erp-backups/procurement-rfq-exponent-ui-20261021_070815/ contains source, runner, complete log, result/exit0, browser output and asset hashes. New bundle HTMLda671151faa252ad39c3f49933b76b3c83bc815197c1bff2a6cfd88dc04569ec, JSindex-rCsi7t2U.js SHA75382a9ad8bc034ea9fe8c0b80c48ba0c5296dbbb6b3779c67de10bac194b01d, CSSindex-Bddc462I.css SHA7f163297e91fa0e3fc3cde778b88996063082e96fb088d9866bfac750639d888. Earlier RFQ/Budget bundles are preserved in their separate worktrees. Mocked presentation tests are not actual backend/browser or production proof.
