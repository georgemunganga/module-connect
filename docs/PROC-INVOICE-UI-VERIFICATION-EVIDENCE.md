# Invoice UI candidate — focused verification evidence

Date:20 October2026. This is frontend client/TypeScript/build and synthetic browser evidence, not production deployment or actual P26 API/database authority proof.

## Frozen sources and assets

- Application build source: `5b5eab660adbaa2c8cabac578e87ecc6175f6be7` (application implementation through `3352c2f`).
- Browser fixture/config-only correction: `64da546`; no application source or generated bundle changed for resumed browser runs.
- Worktree: `/home/amizo/procurement-invoice-review-ui`; dedicated `.invoice-verification-dist`, loopback3041 with no existing-server reuse. Receiving assets untouched.
- Node22.23.3, max Node heap512MB, nice10, Vitest forks1, browser workers1 and no retries. No SDK/DB/Docker/production jobs started by this gate.
- Evidence parent and run directory mode0700: `/home/amizo/erp-backups/procurement-invoice-ui-20261020/20261020T154306Z`. Contains original logs, source SHA, bundle digest manifest, original screenshots/traces and separate resumed JSON/log/artifact folders. No secrets committed.

| Asset | SHA256 |
|---|---|
| `index.html` | `d5ef43beb0baadf6f907c7f5e214645d51a3199d71bcf9cb71de8163156d0524` |
| `assets/index-B4wlDwtG.js` | `e19c2f2c5720b0b418bb1c24ee83f8c67dd990a7cfe5aba1b496877eea1bcb82` |
| `assets/index-Bddc462I.css` | `7f163297e91fa0e3fc3cde778b88996063082e96fb088d9866bfac750639d888` |

## Actual sequence and results

1. New adapter client tests:13/13 PASS (two explicitly named files).
2. Existing capability/scope regressions:17/17 PASS (3capability +14scope).
3. TypeScript:PASS, no errors.
4. Route generation:112 canonical routes; staged live build:PASS,1756 modules. Vite retained its existing large-chunk advisory (JS954.60kB); no gate was weakened or warning hidden.
5. First new-browser run:1 failed,1 interrupted,6 not run; terminal130 after deliberate SIGINT. The assertion searched all buttons for `/pay/` and matched the existing sidebar **Payables** group toggle. Snapshot showed the invoice had no financial command. Original log/JSON and both captured screenshots/traces remain in `first-browser-artifacts` / initial run evidence.
6. Test-only correction64da546 scopes absence-of-payment assertions to invoice `main`, matching existing intake coverage; adds maxFailures1 and explicit evidence directory0700. No timeout increased and no business/security assertion removed. No rebuild or client rerun was needed for this test-only change.
7. Browser-only resume against the identical retained bundle:8/8 new scenarios PASS, terminal0,1.3minutes. Evidence in `browser-resume1`.
8. Separate existing intake/document/403/404 regression run, same bundle:7/7 PASS, terminal0,1.1minutes. Evidence in `existing-browser-regressions`.

These are checkpoint totals, not a claim that the first uninterrupted browser run passed. New test titles and commands are enumerated in [verification plan](PROC-INVOICE-UI-VERIFICATION-PLAN.md). All15 targeted browser cases eventually passed without rebuilding application assets. Port3041 and test/preview processes were confirmed stopped before releasing the shared host slot.

## What this proves and what remains

Frontend tests cover exact numeric strings, safe own-invoice projections, absent capability defaults, version/source/document selection, original-line mapping, explicit saved Blocked comparison, operation-key GET recovery after a lost response, unknown acceptance vszero, current branch/access clearing, and preserved intake/document workflows. Mocking is explicit: these results do not prove real authorization, PostgreSQL constraints, matching owner completeness, provider review, financial posting, payment or stock/asset changes.

The corrected selector backend must complete independent source/runtime gates. Root must compile/rehearse P26 and provide a fresh restricted synthetic backend/browser fixture for actual Unverified mapping→explicit blocked comparison→receipt/history validation. Qualified document-unit review and complete authenticated historical Finance exposure remain unavailable by design; no fake provider or canPost/Validated/APReady is introduced. This candidate has not been deployed. Production/live enablement and integration acceptance remain separate coordinator-owned decisions.
