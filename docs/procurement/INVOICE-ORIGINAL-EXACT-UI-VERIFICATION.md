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

## Pending at this checkpoint

The parent is running the full mock `live-invoice.spec.ts` gate, session73483; its terminal result was pending when this record was written. Evidence target: `/home/amizo/erp-backups/procurement-invoice-ui-20261020_1752/browser.log`. Do not infer a pass from progress output.

The existing two actual P26 backend/browser scenarios and strict one-invoice persisted owner verifier must still run against this exact new candidate. Their source/fixture counts are unchanged. Earlier mock/actual results from other candidate hashes are not proof for this one. No deployment or production enablement is authorized by this record; release hold#29 and base invoice review PR#34 remain applicable.

## Review scope

The correction preserves decimal text in original invoice input, aggregate previews, outbound payloads, backend numeric-wire parsing and display. It adds no Finance/unit-review completeness, payment action, backend/model/migration change or extra actual-fixture invoice. See `INVOICE-ORIGINAL-EXACT-UI.md` for source details and the remaining verification sequence.
