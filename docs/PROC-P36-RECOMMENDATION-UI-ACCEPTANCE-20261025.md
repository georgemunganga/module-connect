# P36 recommendation draft UI targeted acceptance — 25 October 2026

**Result: PASS for the scoped frontend with mocked APIs and non-live preview.** The tested source is `23c104d1fe5630234b1766c9e70c5a44822ced7d`. Run03 completed 14/14 single-worker mocked live Chromium cases and 2/2 single-worker non-live preview Chromium cases, with zero failed cases in either run. The protected run03 result reports `sourceUnchanged: true`, `actualBackend: false`, and `productionTouched: false`.

TypeScript typecheck and 9/9 focused units passed in run01 at application source `e023e8454877ed954a065406577d5c8a7bd552a7`. They were **not rerun** in run03. The only changes between that application source and tested source `23c104d1` were to `reference-ui/tests/e2e/live-rfq-recommendation-draft.spec.ts`; no application source changed. Run03 therefore carries the earlier type/unit evidence, without presenting it as a new run.

The mocked live cases cover recommendation-only named-reader access, verified titles and non-disclosure for unverified or wrong-branch rounds; owned-draft selection; exact quantity/value strings and revision CAS; original-key recovery after lost or unverified acknowledgements without duplicate POST; definitive 422 correction; substituted acknowledgements, retained lines and journals; revoked actions, absent capability, Organisation All, and stale revision. The two preview cases confirm that the recommendation worklist and detail routes retain the ERP shell without live recommendation API calls when live mode is off.

| Protected evidence | SHA-256 |
| --- | --- |
| Run03 result (`result.private.json`) | `314e5841c1ccf3b332c1e9186b5c6d6314c6baf51b06ddb5f25ff40c97a7f1fe` |
| Run03 mocked browser log | `084557fa1738bfc88f073eb272372d44e0955bba83517e1bac8744a330545d18` |
| Run03 preview browser log | `e6b63a1c06bdbce64640b7ae1ab644160f962816cb5708da0f55e7e616f5d4c7` |
| Run01 typecheck log | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Run01 unit log | `9c166739256ae7de3b88b92520d71c370abe77f2ff078f0e788dea7ed49db5ce` |

Protected evidence directories are `/home/amizo/erp-backups/procurement-p36-recommendation-ui-validation-20261025_run01`, `_run02`, and `_run03` under the same basename. These are local validation artifacts, not files published by this receipt.

## Earlier failures retained

- Run01 (`e023e8454877ed954a065406577d5c8a7bd552a7`) passed typecheck and 9 units but failed mocked Chromium: 4 passed, 3 failed, 7 did not run. Three tests used native `selectOption` against the ERP shared `role=combobox` control. Result SHA-256: `92f90326b856ff2be7e9f2a08165750c88c42fc6620ede99fcd7c75c3ff2a637`.
- Run02 (`a46c57dc031ecc326266541a682d98f9ef760ea9`) passed 13/14 mocked Chromium cases; the definitive-422 correction case failed because the mock did not retain the accepted recommendation line and the expected owned draft link did not appear. Type/unit evidence was carried from run01, not rerun. Result SHA-256: `277941e38d100b1e695bf064dfbd2de67dfdc6481685d7781ad56894888f64fa`.
- Run03 fixed the browser fixture and passed the two scoped browser suites. It does not relabel run01 or run02 as passes.

## Limits

These tests exercise a mocked frontend contract and non-live preview only. They do not prove actual backend composition, named-reader policy in a running ERP, authenticated HTTP, deployment, production use, approval, award, PO creation, supplier notice, or financial effects. The recommendation remains a draft and must be enabled only when the real server advertises its distinct readiness-derived capability to an authorized principal in a selected branch. The separate server and integration gaps remain in `reference-ui/docs/P36-RECOMMENDATION-INTEGRATION-GAPS.md`.
