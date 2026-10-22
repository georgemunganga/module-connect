# Exact original invoice UI — candidate verification record

Source candidate: `dccbc1498700746c8d0903641b5826b37b6ad8fb` on `codex/procurement-invoice-exact-ui`, based on `39052e55362b2bc03eb1c5d7506c1271085a1ac8`. Recorded20October2026. This is a separate candidate from the earlier frozen invoice bundle; its assets/results must not be interchanged.

## Confirmed central gate

The parent engineering agent ran the serialized verification job (session29679), terminal exit0. Evidence retained privately at:

`/home/amizo/erp-backups/procurement-invoice-ui-20261020_1752/units-types-build.log`

| Check | Actual result |
| --- | --- |
| New exact-original helper/client tests |20 passed |
| Existing invoice matching contract tests |7 passed |
| Existing invoice review contract tests |6 passed |
| Combined focused unit/client gate |33/33,3files,8.31seconds |
| TypeScript noEmit |Passed, as reported by central verifier |
| Production candidate build |Passed;1,758modules;39.50seconds |

Built output names: `.invoice-verification-dist/assets/index-Bj0myMuD.js` and `index-Bddc462I.css`. The ordinary Vite large-chunk advisory remains; this record does not claim warning-free output or a new bundle digest. No new frontend tests/build were run by this documentation task.

## Confirmed full mock browser gate

Central session73483 terminated0: **16/16 passed in6.9minutes** against unchanged app source `dccbc14`. This includes the new wide4dp capture/raw-numeric-response browser case (21.3seconds) alongside the existing invoice/document/mapping/comparison/recovery/permission cases. Evidence: `/home/amizo/erp-backups/procurement-invoice-ui-20261020_1752/browser.log`. The slow-file advisory is retained; no parallel job or timeout change was used by this documentation task. This terminal result supersedes the earlier pending checkpoint only; it is mock transport proof.

## Actual business API browser and independent owner gate — passed

Fresh private fixture `20261020_183557_browser` ran against this exact application candidate. Playwright session26932 exited0: **2/2 cases passed in2.3minutes**. The actual business API covered invoice capture, Core document upload/scan/download, approved-source selection, Unverified mapping, explicit Blocked comparison, original-key GET-only recovery after a lost response, reader403 and authorized foreign-branch404 denials. These scenarios do not claim qualified unit evidence or Finance/AP/payment execution.

After the browser finished, the API was stopped and NEW independent owner contexts verified the persisted original amounts/version, mapping, comparison, command receipts, audit/outbox, document hashes/lifecycle and unchanged upstream PR/PO/receiving effects. Exposure remained Unknown with zero allocations and no active claim. Backend/owner session20786 exited0. The known-fixture-only scanner verifies test bytes; it is not production malware protection.

Protected logs, manifest and copied Playwright traces/results are retained at `/home/amizo/erp-backups/procurement-invoice-postgres-20261020/20261020_183557_browser`. Frozen SHA256:

| Artifact | SHA256 |
| --- | --- |
| HTML | `60196e68e0918e56cdae6300f98f4750b5d8ba16817f848a013f077188f0ebf6` |
| JS index-Bj0myMuD | `bb816e26955de8be16b13e7e31cc2a59de84b6b51691ba823f9d031176933064` |
| CSS index-Bddc462I | `7f163297e91fa0e3fc3cde778b88996063082e96fb088d9866bfac750639d888` |
| API | `4cb6f14612afa75ccfe9f73f064bc89331b718d3436e77875e4c7034d69b7f12` |
| Verification tool | `d55b8a275d29456640db9044203819fc9e4ff1cf60fc63d1f86d02d7c261fcf5` |

Backend application source3613559 and test-only tool36c5d38 were frozen for this run. The separate fresh restricted HTTP/PostgreSQL CLI session27214 subsequently exited0 (`20261020_184252_matching`), including denial, concurrency and read-only readiness gates; backend evidence commitc404564 records that result. No deployment or production enablement follows from these results; release hold#29 and base invoice review PR#34 remain applicable.

## Review scope

The correction preserves decimal text in original invoice input, aggregate previews, outbound payloads, backend numeric-wire parsing and display. It adds no Finance/unit-review completeness, payment action, backend/model/migration change or extra actual-fixture invoice. See `INVOICE-ORIGINAL-EXACT-UI.md` for source details and the remaining verification sequence.
