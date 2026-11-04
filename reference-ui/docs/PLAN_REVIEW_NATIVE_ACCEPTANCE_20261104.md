# Purchase Plan UI — private acceptance and release boundary

As of 2026-11-04, [UI PR103](https://github.com/georgemunganga/module-connect/pull/103) has a passing private normal-Core-cookie transaction journey on the existing Plans/Approvals presentation. Product source is `3e2783b1f373857ba11681e73407c13ab09e30a8`; the executed harness is `830f2813fde69d56ec3aabeaf36541a8bb3d7be5`. Later documentation commits do not change the product/harness bytes. This is scoped evidence for [ERP issue172](https://github.com/georgemunganga/erp/issues/172) and backend PR171, not whole Procurement UAT or parent issue145 completion.

## Product and local checks

The new-draft editor previously compared an absent pending record ID with an absent route ID, disabling Save draft. It now locks only an actual matching retained plan. The original form, shared Field/Input, list/detail panels, Approvals entry and submitted-version dialog remain in place. The harness Currency textbox selector accepts the shared implicit label's hint, records fixed field counts and separates each fill/assertion step. It persists no raw DOM or transport exception messages.

Product `3e2783b1` passed 26 focused Vitest cases: 21 Plan API/guards, 2 actual shared Field/Input ReactDOMServer markup checks and 3 safe-evidence checks, with zero failures/skips. The markup check is not a jsdom/browser-accessibility test. Strict native config/input/spec/reporter TypeScript passed. The LIVE production build also passed app TypeScript and Vite (1873 modules,17.25 seconds; existing chunk-size advisory), using the accepted branding/base protocol, `VITE_PROCUREMENT_LIVE_MODE=1`, existing dependencies, nice 10 and a768 MiB heap. Five immutable files total1,780,351 bytes. Prior94e5 and production26d4 artifacts were hash-verified unchanged.

Harness `830f2813` subsequently passed strict TypeScript and8 pure outer-controller tests. Its actual selected service/cleanup budget was 240/90 seconds, with a 180-second Playwright test timeout, one worker, zero retries,512 MiB Node heap and strict 1 GiB browser service cap. Root admitted the actual lease/resources independently. No lease extension, cache dropping, broad process kill or host mount change was used.

## Actual browser and owning evidence

Root supplied the private migrated fixture, genuinely configured policy, API/HTTPS gateway and three independent normal Core-cookie states. The browser used backend `6e85bdc81c0d6b8362e36b4c6a744b934e8c2caf`. It used no business route interception, response substitutions, identity aliases, employee-as-identity or SQL-seeded Plan rows.

| Existing UI path | Actual result |
| --- | --- |
| Owner New purchase plan → Save draft → detail/reload | Create201, exact submitted quantities/amounts, company currency read-only; Save draft enabled. |
| Owner Send plan for review | Submit201; actual policy version, submitted snapshot/hash, submission and case retained. |
| Reviewer To review → verified task submissionId → submitted dialog | Owner-only GET403; reviewer UI did not use that owner endpoint; immutable submitted evidence shown. |
| Reviewer Mark as reviewed | Review200. |
| Independent final actor To review → Approve plan | FinalApprove200; wire Plan=Active, round=Approved, human Plan label=Approved. |
| Owner detail/reload → Open submitted version | Retained snapshot/hash/history and two decisions confirmed; historical decision controls absent. |

Exactly 4 business commands started and4 were confirmed. Three governed command keys are retained in private evidence; no automatic POST retry occurred. Page errors were 0. Fixed diagnostics confirmed Currency exact-label count 0 and prefix-textbox count 1. Record IDs came from real responses and remain private.

The outer controller independently observed the actual uniquely owned systemd invocation, stopped that browser service and verified its scope empty/removed. All 3 issued normal cookies were independently checked inactive after logout attempts, including any actor unused on a failure path. This does not claim the outer helper newly revoked cookies already logged out by the inner flow. Root's independent owner proof reconciled 13 domain rows, 14 Procurement audits and 3 outbox rows, exact receipt response bytes, all original rows and the preserved first-attempt cohort. The browser report's provisional “await owner/cleanup” status is closed by those separate receipts, not by editing its original bytes.

## Retained first failure

The first browser attempt on product94e5 stopped at owner-original-draft-editor with 0 started/confirmed business commands and 0 page errors. Its report, private rows, cookies/process cleanup and artifact are retained. Source/markup audit corrected the Currency selector and independently found the new-draft pending guard defect. The successor3e build was used for run02 only after Root reconciled the zero-command failure and supplied fresh normal-cookie states. The failed report was not overwritten, and no saved Create was replayed.

## Evidence index

The following are hashes of Root-owned private receipts, not committed personal data, authentication states or raw logs. Full paths remain in the private execution package.

| Receipt | SHA256 |
| --- | --- |
| Product test source binding (26 cases) source binding | `1ac1f27c2a82c29ee17a41db6fd3259cd4b0d84410710bf453157291ffe0f693` |
| Product3e LIVE asset manifest | `6739cecbbd0b608f8e6d9f0d0c656b793360d21a64dddc11df76af7c9db67a6b` |
| LIVE build proof | `f827d0da5eedf652d5a46f33d83dc250897ca4985fd9cea6eefe70e79124b020` |
| LIVE build source binding | `b94815f3f7a10d46cde41764885a18e5196e2a838ea532fd0a7ec2c7f5468903` |
| First failed browser report | `b31f8f2686e45f44086e2c2bd4bf0d4bd024f1f37e13c611bb89dad61116445d` |
| execution-run02/browser-positive | `4c51b7775aa0f6c8d76179a9d7af9293c49b68fe9b0ae7352f5241d742b297be` |
| run02 outer-cleanup-proof | `1752f4015f38559d9213a66928d6ccfe2d3896206921d09b7708c6e541e62a38` |
| run02 all-three-cookie-cleanup | `8cf33da7766209956077088c686a17f7af4378e0cdb2edad251758e39bc3b7bb` |
| run02 scope-empty-proof | `fa380d9adafdee447c950bf6f8951b4ff0483402df1ae60d3aaf59bfd18a31b1` |
| execution-owner-r3/COMPLETED | `dc5d6c2d9b89d15dd0f69de9f990cc40a9f6456f48ef732e84bb5d7216ecb079` |

## Backend successor and remaining release work

The browser pin above is distinct from later backend candidate `c93e8df4f82214b58273bf0c9be58d013aca3331` (tree `adbcb5c396deba114fe57659e04349dc49e129c7`), which adds optional Core projection compatibility. Its genuine SDK receipt passed 551 Host tests, zero failures/skips; 2004 Procurement tests were exactly reused, not rerun. The post-primary retention and six native privilege-negative checks exercise the unchanged genuine SQL on retained private native databases; they do not execute the c93 runtime. Current c93 compiled compatibility/technical-provider checks are separate evidence. Neither establishes a c93 browser run. ERP PR171 is now merged at published main `c02f90a33fbce0983a8520d643098c1662a0ded5`, with the exact tested backend tree `adbcb5c396deba114fe57659e04349dc49e129c7`; the paired production upgrade remains pending.

| Later candidate receipt | SHA256 |
| --- | --- |
| Compiled551 completion | `649d1f1079b0f39d766cd95535bdd660be51cb4c10ee6c9aafaf7ff2bc64e9ae` |
| Committed-source binding | `3bf12df82cd85f7f00dcac6a13fdec660c44910b0b247cf69e90fbb2e247de35` |
| Publication manifest | `6ff57b4c5cbbcee999b12706e7f0ba41dc05712948ce2a471c4e48ab7829ef76` |
| Post-primary retained/read-negative native completion | `9a5549dc41a5f049de877111c191fd1aeee8e1b62a9246eca42df045d3f2d2d7` |
| Stopped delta-image completion | `45cce18d70e4fd428e9b89f2ef8523f72ae26821ba2be8afbcc8044a1dba55c8` |

Image `8fa2f59813d6670e71281b3f37ef752e7ce042cc1c349e5d63b7967b257baa66` was built with all 150 publication files verified; that image receipt starts no host runtime. Fresh backup/restore admission, production schema step, paired API/UI cutover, rollback admission and public verification are still Root-owned release gates. This document claims no deployment, production policy activation, signed-in production CRUD or CI-green status.

The policy fixture was genuinely configured through actual normal-cookie HTTP. The Plan policy editor's real-browser configure/review/publish journey, broader negative/return/reject/withdraw/CAS/recovery matrices and complete desktop/mobile parity remain separate acceptance scope. Unknown policy-command outcome acknowledgement remains a future server-backed gap; no local clear/replay was added. Parent145 stays open.

## Published-main check

On 2026-11-04, fetched UI main was `9b5d02dcf971900289793f56e91895dd3747fd80`, already an ancestor of PR103. GitHub reported MERGEABLE/CLEAN. No conflict resolution or history rewriting was necessary. This closure changes documentation only; runtime src/shared remain byte-identical to product3e. Root reviews/merges the draft and owns release actions.
