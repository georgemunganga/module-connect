# PROC-03 — Exact Finance check amounts in the existing Budget UI

Source-only child-feature addendum. Based on frontend5409546; requires separate additive backend queue contract ba5b380; no backend/schema change in this branch. Build/test/browser evidence pending. Existing RFQ/invoice frozen artifacts remain separate. Tracking: existing Procurement integration milestones; release hold#29 applies.

## 1. Feature Identification

Existing Budget queue, Finance check form and history: exact transport and an explicit Amount checked field.

## 2. Purpose & Business Outcome

Finance can read the exact request total and record the amount actually reviewed without JavaScript financial rounding or a hidden eight-to-four decimal conversion.

## 3. Scope & Exclusions

Original queue estimate (up to8dp), Finance checked amount18,4, exact local coverage check, read-only history checks. No Finance ledger, budget creation, fund transfer, default funding approval, payment or backend authority changes.

## 4. Parent & Related Features

Existing request submission/budget evidence/manual Finance workflow; shared invoice JSON lexer/decimal formatter. Finance release panel remains separate and available under its existing capability.

## 5. Actors & Participants

Existing Core procurement-budget-check grant and company/branch context. Canonical independent Finance checker remains server-owned; no client worker/checker override.

## 6. Entry Points & Triggers

Existing `/budgets`, Review funding, Save Finance check, and read-only history/recovery. No new page/menu.

## 7. Preconditions

DoR: backend BudgetDecision.CheckedAmount uses existing CommercialLineDecimalJsonConverter, accepting exact numeric strings before18,4 validation. Server checks input >= exact source total for every outcome. Queue numeric estimate may have8dp. No invented owner or provider is needed. Queue must supply authoritative businessVersion separately from current version CAS (backend ba5b380). Missing/unsafe businessVersion fails closed before any POST.

## 8. Workflow

Read raw JSON lexemes through the existing bounded token lexer configured for estimatedAmount/checkedAmount → show exact request total → default Amount checked only when exactly18,4 representable, otherwise blank → Finance enters reviewed amount and explicitly chooses outcome → validate exact coverage → explicit POST → validate response or show unknown-save state. Uncertain review only GETs existing Finance check history; no automatic repeat POST.

## 9. Status / State Transitions

No status is inferred from amount. Funding outcome starts unselected; user chooses existing Available/PartiallyAvailable/Insufficient/NotConfigured. A recorded check does not approve a purchase. Unknown save remains visibly unconfirmed.

## 10. Permissions & Data Scope

Reuse existing readiness/action and scoped API headers; server remains authoritative. Reactive tenant/entity/branch/worker/action/capability changes remount the whole Budget surface, including existing release panel, clearing old data and pending local form.

## 11. Business Rules

Checked amount is exact18,4 and covers exact source estimate (8dp BigInt comparison). Never ceil, round to currency, silently reduce precision or infer approval. A source amount that cannot fit18,4 gets no suggested default. Financial values never pass through Number/parseFloat/toFixed.

## 12. Data Fields & Ownership

BudgetQueueRecord.estimatedAmount and BudgetCheck/BudgetDecision.checkedAmount become decimal strings. Shared JSON lexer converts only configured known keys before JSON.parse; metadata integers retain numeric type and safe-integer validation. Finance checker identity metadata is additive server-owned/read-only and not round-tripped as command authority.

## 13. Screens & Data Views

Existing Field/Input/Select/formatters/table/branding. Add Amount checked with simple exact-precision guidance. Display exact amount in queue/review/history; no new component system.

## 14. User Experience / Human Behaviour

Show source total without losing significant digits. Explain that Amount checked is the full amount reviewed, not an account balance or the portion available. For >4dp ask Finance to enter its reviewed4dp amount covering the exact request. Require explicit funding outcome.

## 15. Notifications & Communications

No new client notification side effects. Success is shown only after confirmed server response/recovered check; no approval message.

## 16. Documents & Attachments

Existing evidence reference only; no document or bank-data collection added.

## 17. Exceptions & Edge Cases

Wide18,4 values,8dp source totals, source larger than18,4 range, underfunding by fractional precision, malformed/duplicate JSON, escaped description strings, unsafe CAS, denied scope and unknown save all fail safely. A validation rejection permits correction; transport/5xx/invalid success never auto-retries.

## 18. Integrations / APIs / Events / Sandbox

Existing GET budget-queue/budget-checks and POST budget-checks only. Numeric backend wire unchanged; body sends checkedAmount string accepted by existing converter. Preserve request CAS, Finance/evidence/reservation references. No new server event, schema or provider.

## 19. Audit / Security / Privacy

Server audit/identity/independence unchanged. No private checker proof is fabricated, inferred from a readonly hash, or sent by user. UI retains only existing references during ambiguous recovery; no secret storage.

## 20. Reports / Dashboards / Metrics

No new metric. Display amounts preserve source significance rather than two-place currency rounding.

## 21. Configuration & Localization

Existing Core font/colors/shared controls; exact string grouping formatter. Currency is request-owned, not switched to an invented default.

## 22. Non-Functional Requirements

Reuse single bounded JSON lexer (2MiB/depth24/node25000), no second JSON parser. Source decimal normalization is bounded, max38digits/8fraction. GET cancellation/late-result checks and context remount prevent stale cross-scope display.

## 23. Postconditions

A known validated POST response shows the recorded check; unknown result remains pending even if history contains matching details. No claim that budget exists, funds moved or purchase was approved.

## 24. Failure & Recovery

Keep original Finance reference/decision while response unknown; GET history only shows recorded funding; an exact FinanceRef/body match cannot identify the original recorder or certify the interrupted command. No automatic POST retry or generated replacement Finance reference. Exact receipt contract is absent, so failed recovery does not prove no write.

## 25. Acceptance Criteria

Raw wide4dp/8dp numeric tokens arrive as exact strings, descriptions/metadata unchanged. Source8dp not exactly representable yields blank editable Amount checked; under-covering or over-precision blocks before POST. User-entered exact reviewed amount and explicit outcome preserve strings. Interrupted save cannot cause an automatic second POST. Invoice parser default behavior remains unchanged.

## 26. Test Scenarios

Author focused unit/client cases for numeric-token precision, escaped strings, source8dp/default blank, exact underfunding, unchanged invoice parser, exact response/request checks, unknown save/no automatic retry. Extend existing budget transport fixture with bounded new cases for wide4dp capture,8dp no default/no rounding and unknown response/read-only recovery; retain existing permission/normal-save cases. All authored tests initially unrun; coordinator owns serial gates.

## 27. Ownership / Dependencies

Frontend owns exact presentation/input/transport only. Procurement/Finance own snapshot validity and Core owns checker identities. Shared invoice lexer/18,4 decimal helper stay reusable and behavior-compatible. No backend, schema, ledger or Finance engine is implemented here.

## 28. Open Decisions / Assumptions

Separate backend ba5b380 adds businessVersion=SubmittedVersion??Version. Client requires both safe-positive businessVersion and current version CAS, sends only current CAS as requestVersion, and binds the returned snapshot requestVersion to expected businessVersion. It never sends an invented authority field or substitutes businessVersion for CAS. Older APIs without businessVersion show setup guidance and cannot save. History still cannot prove original recorder identity, so interrupted saves remain unconfirmed without a stronger owner receipt contract. Existing Finance release exactness is outside this request-check slice. Production release and actual finite-role/backend/browser verification remain pending.

### Source checkpoint and backend dependency

Backend owner has confirmed additive contract ba5b380: queue.businessVersion is the retained business version; queue.version remains current source CAS. Both are independently required/safe-integer validated. Only current CAS is sent as requestVersion; successful snapshot.requestVersion must equal expected businessVersion. Parent will combine/gate backend and frontend; no fallback for an older queue.

Uncertain history review deliberately remains unconfirmed even when Finance reference/body match. No current principal projection exists to prove original recorder; the UI displays recorded content and keeps mutation frozen. It does not manufacture a UUID receipt or new confirmation authority. Known validated POST response remains the existing server-authorized completion path.

Authored source includes ten new exact client/helper cases and four additional transport-browser cases (wide4dp/CAS-vs-business version,8dp blank/no-underfunding, interrupted-save read-only history/no recorder inference, and missing businessVersion no-save); two existing Budget browser cases are preserved and updated for explicit outcome selection and exact checkedAmount string. No author jobs, schema changes, backend edits or production effects.

### Prepared serial verification (not executed)

Coordinator must grant the single resource slot, freeze source, retain private logs and verify dedicated port3045 free. Use cached Node22, heap512, CI=1, one worker and no retries. Existing RFQ/invoice/receiving artifacts must not be replaced.

```sh
node node_modules/vitest/vitest.mjs run tests/budget-exact-contract.test.ts tests/invoice-original-exact.test.ts src/lib/procurement-live.test.ts src/lib/procurement-scope.test.ts --pool=forks --maxWorkers=1 --minWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
node scripts/generate-routes.mjs
VITE_PROCUREMENT_LIVE_MODE=1 node node_modules/vite/bin/vite.js build --outDir .budget-verification-dist
node node_modules/@playwright/test/cli.js test --config playwright.budget.config.ts --workers=1 --max-failures=1 --reporter=line
```

Dedicated browser config selects exactly four new precision/uncertainty cases and the two retained Budget regressions. Retain source/bundle SHA256, logs and first failing trace/screenshot. Source author ran none of these gates. Actual backend finite-role testing including ba5b380/P27 is separate; transport mock success cannot certify Finance ownership or migration readiness.


## Coordinator verification — PASS, 21 October 2026

Applicatione73b308 passed48/48 focused tests (10Budgetexact,20invoiceexact regression,14scope,4livemetadata), zero failed/skipped,3.75seconds; TypeScript noEmit;112canonical-route generation; production build; and **6/6 Chromium transport-fixture browser scenarios**, one worker/zero retries,23.3seconds. Build has the existing large-chunk advisory. No application source changed during the run.

Protected evidence `/home/amizo/erp-backups/procurement-budget-exact-ui-20261021_063022/` retains source, exact runner/log, exit0, asset hashes and browser results. BundleJS `index-JuvMCZhV.js`; CSS `index-Bddc462I.css`. Browser checks include wide4dp/CAS distinction,8dp explicit amount/no underfunding, uncertain-save read-only history/no repeatPOST, absent businessVersion denial and retained ordinary-save/permission-denial cases.

Backend business-version sourceba5b380 is integrated separately asc86d653. Its API test and actual restricted P27 HTTP gate remain separate; these browser mocks do not establish Finance authority or release readiness. No production deployment.
