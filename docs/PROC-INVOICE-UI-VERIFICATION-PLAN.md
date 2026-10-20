# Invoice UI candidate — serialized verification plan

Status: commands prepared only. Candidate application source `3352c2f`, reviewed without a blocker. No command in this document has run. Root owns the current receiving browser/backend resource slot. Await explicit clearance; no concurrent Node, browser, SDK or DB job.

## Isolation and resource contract

Worktree `/home/amizo/procurement-invoice-review-ui`, separate branch `codex/procurement-invoice-review-ui`. Use cached Node22.23.3 and existing reviewed dependency cache; do not install, upgrade or mutate packages. No receiving worktree/artifacts touched. Dedicated `.invoice-verification-dist`, `.invoice-test-results`, loopback port3041 with strictPort and no server reuse. One Vitest fork / browser worker, NODE_OPTIONS max-old-space-size512, no browser retries. Root must confirm port3041 free and available host memory before granting the slot. Chromium's process memory is separate from the Node heap; one browser worker is a concurrency bound, not a claim that Chromium fits inside512MB.

The prepared script refuses without `INVOICE_UI_GATE_AUTHORIZED=1`, tracked source cleanliness, cached Node22 and fresh invoice output directories. It never deletes artifacts, starts Docker, writes a database or deploys. All stages use pipefail+tee and stop on first failure; retain first failure before a reviewed fix. Logs, source SHA, Node version, JSON browser results, traces/screenshots and per-file bundle digests are separate evidence. Do not hide a failed gate by changing timeouts, disabling assertions or silently rerunning the whole suite.

After explicit clearance only:

```bash
cd /home/amizo/procurement-invoice-review-ui
INVOICE_UI_GATE_AUTHORIZED=1 reference-ui/scripts/verify-invoice-candidate.sh
```

The script is the exact executable sequence:13 new client cases →17 existing capability/scope cases →TypeScript →route generation →one staged live build →8 new mocked browsers →7 existing invoice regressions. All browser runs use the same newly built invoice bundle. After a failure, keep the bundle/results and ask the coordinator to run the single corrected stage in a fresh evidence path; the safety check intentionally refuses to overwrite earlier artifacts.

## Exact new client coverage:13, not26 or all tests

`tests/invoice-review-contract.test.ts` has six cases: scoped GET/exact digits/privacy; invoice/version/nonauthority envelope; numeric money/foreign line rejection; unknown count and missing owners; denial/network/no retry; safe own history/historical flags.

`tests/invoice-matching-contract.test.ts` has seven cases: scoped source exact strings; unknown acceptance vszero; receipt identity/kind/source/exact facts; full original line/document mapping; stable one-shot unverified mapping receipt +advanced version; recorded Blocked comparison/private field removal; interrupted POST/same-operation GET recovery. Additional input variants inside a single `it` are assertions, not additional passed cases.

Existing `src/lib/procurement-live.test.ts` has three capability/auth/schema cases. Existing `src/lib/procurement-scope.test.ts` has14 (12 parameterized adapters plus stale-company/branch and next-request branch refresh). These17 are concrete shared-boundary regressions, not new feature tests.

## Exact new mocked browser cases:8

1. Bills detail explains missing invoice approval and Finance without creating a transaction.
2. Recorded comparison keeps exact values and remains separate from approval and payment.
3. Invoice review clears history on readinessDenied.
4. Invoice review clears history on staleReview.
5. Changing Core branch clears original invoice, documents and review before delayed replacement reads.
6. Invoice links and explicit comparison use the current version without implying approval.
7. Lost mapping response offers only original-key GET recovery, never another POST.
8. Unknown acceptance history is unavailable and cannot be saved as zero capacity.

The prepared config limits testMatch to live-invoice.spec.ts and script grep selects exactly those names (the denial/stale parameter produces two). Separate grep-invert selects seven existing cases: intake/no payment; read-only intake denial; uncertain document upload; scan retry; read-only document upload denial; navigation403; navigation404. Existing receiving/order/settings suites are not rerun by this bounded gate because this increment changes no shared component implementation or route registry. Broaden only for a concrete remaining risk or failed required gate.

## Next actual P26 browser gate — pending backend

Mock browser success cannot prove backend identity, scope, transactions, evidence ownership or PostgreSQL persistence. After corrected selectors and P26 backend are compiled, independently reviewed, migrated/rehearsed on a fresh private synthetic restricted-role fixture, root must expose that exact candidate to a dedicated browser config. Reuse actual issued PO/P25 acceptance/Available invoice document pins, governed matching policy and finite invoice read/capture/match grants; no broad PO/receiving permission fallback. Verify named source selection and exact original lines, immutable Unverified mapping and advanced invoice version, explicit comparison with real unavailable-review/Finance-owner blockers, saved result/exception/outbox/command receipt, zero claims/AP/payment changes, no automatic compare on GET, original-key recovery/current scope denial, and no cross-branch/other-invoice facts. Do not invent positive qualified history or mark an invoice approved to make the browser pass. Actual fixture IDs, endpoints, credentials injection and final bundle hash are supplied by the coordinator; this plan contains no production secrets, fake Finance provider, deployment or completed runtime claim.
