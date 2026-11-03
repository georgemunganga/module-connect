# M7B1 UI build and normal-cookie acceptance milestone

**Current status: private browser continuation passed; independent final owner reconciliation and release remain pending.** The original preparation instructions below are retained as history, not permission to rerun Fresh/Create on the retained fixture. Tracks [ERP issue173](https://github.com/georgemunganga/erp/issues/173), [UI draft PR104](https://github.com/georgemunganga/module-connect/pull/104) and [backend draft PR165](https://github.com/georgemunganga/erp/pull/165). The first product was `8dca4943bbe5b5ea4993a7eecb0e7a40fecb53c1`; the confirmed All-scope correction is `26d4ef1924b508a4ca33a184ec21500691003b3f`. No deployment is authorized by this record.

Root owns clone creation, genuine migrations, grants, Core fixture setup, runtime/proxy launch, flags, native SQL reconciliation and cleanup. The actual private backend used source `0f9bbc0bc9a2c236b40613d46538751323b78eaf` / publication 28 after its 411-test SDK pass. Publication manifest SHA256 is `9d50f4d714b550729f349dfb190f9e8b04122c09115060da6be5ee9c718ec59d`; committed-source binding is `e875c9cd84079f8f3199ba731fc19f2f02e566a586794d8a1c26a0c2f6804522`. Earlier source review of `fcb1ef6b` is retained as history. These are private acceptance pins, not production deployment evidence.

The earlier private publication 27 Create 503 arose before any B1 business rows from the private table-owner `erp` missing USAGE on `procurement`; the finite role already had USAGE. Preserve its failure, original key and Root's reviewed one-edge repair receipt. Root owns that native original-key continuation. Its resulting graph must not be copied or SQL-seeded as this fresh UI fixture.

## Phase A — Root prerequisites for a separate fresh UI clone

1. Clone the preserved original 231-table source, not a future Cancelled native test graph. Fence actual private PostgreSQL system identifier, source/clone database names, source fingerprints and container/network identity. Preserve source before/after fingerprints; never operate on production or an older clone.
2. Apply the genuine captured B1 Up migration and existing approved SQL helper/append-only protections, with expected owner `erp`. Verify the six actual B1 tables exist, all initially contain zero rows, schema capture matches the successful build, and the owner has the reviewed schema USAGE edge. Do not add business rows with SQL. The tables are `commercial_round_enrollments`, `commercial_round_plans`, `commercial_round_plan_revisions`, `commercial_round_criteria`, `commercial_round_participants`, `commercial_round_plan_receipts`.
3. Apply only Root's reviewed finite 107 execution profile, Core minimal read/auth requirements and the three explicit B/C actions `procurement-round-plan-read`, `procurement-round-plan-manage`, `procurement-round-plan-cancel`. Use the actual workerless Core B/C accounts, current company/branch assignments and normal password/session cookies. Each differs from original source maker A. No employee mapping, identity alias, broad HRM SELECT, Core approval mutation, Finance write or production business policy activation.
4. Verify the actual untouched/unpublished principal RFQ Draft and held approved demand from the source. Capture current original maker, event version, source/line/allocation fingerprints and zero publication/invitation/contact/quotation/award exposure. Discovery eligibility remains provisional; the actual Create command rechecks it.
5. Start the exact accepted backend publication against this clone only, with private Read/Record options reviewed for this fixture. Confirm actual current Core login/context/meta/round detail and role readiness. Pin full backend source, publication hash, container ID, network-owner PID, database/system ID. Owner schema USAGE must be effective before the browser; no grant repair happens inside a test.

These are Root preparation/evidence requirements, not an executable SQL plan in this UI branch. An actual frozen preparation receipt must substantiate every input assertion below.

## Phase B — bounded fresh product build, after Root releases a slot

Use a clean detached product checkout at exactly `8dca4943bbe5b5ea4993a7eecb0e7a40fecb53c1`; do not build the test-preparation commit and label it as that product pin. Reuse the installed dependency symlink, Node `/root/.nvm/versions/node/v22.23.3/bin`, no package installation, no SDK/Docker build.

Run one job at a time, nice 10, Node heap 512 MiB, `UV_THREADPOOL_SIZE=1`, `GOMAXPROCS=1`. Start only with at least 1.4 GiB available and no SDK. Stop on material pressure or under 500 MiB available; coordinate rather than silently increasing limits. Build and browser must remain serial. The existing staged build includes its own typecheck, so do not add a redundant pre-build full typecheck.

From the exact product checkout's `reference-ui` directory, the reviewed command is:

```sh
PATH=/root/.nvm/versions/node/v22.23.3/bin:$PATH NODE_OPTIONS=--max-old-space-size=512 UV_THREADPOOL_SIZE=1 GOMAXPROCS=1 VITE_PROCUREMENT_LIVE_MODE=1 nice -n 10 npm run build:staged
```

Root captures the real command, environment, clean product/source binding, exit code and log hash in a new mode 0600 build receipt: `{sourceCommit:<full product SHA>,exitCode:0,liveMode:true,...}`. A receipt must describe an actual completed build, never be prefilled as passed.

The inert `scripts/m7b1-ui-build-manifest.py` then checks the source pin/clean tracked files and actual receipt, copies all `.verification-dist` files into a fresh immutable private-package static directory, verifies SHA256/size and writes a new mode 0600 manifest. Invoke it only with `M7B1_REVIEWED_STAGE=1` after review, passing `--checkout`, `--build-receipt`, `--stage`, `--manifest`. It performs no runtime, DB, alias or deployment work. The public static root and every directory are explicitly 0755; files 0644. This includes the root directory itself, avoiding the prior M7A umask077/0700 artifact500 and controlled rollback. Manifest contents are `{schemaVersion:1,uiSourceCommit,liveMode:true,buildReceiptSha256,staticRoot,files:{relativePath:{sha256,size}}}`. Record the real artifact count; no assumed five-file claim before building.

## Phase C — Root HTTPS forwarding proxy

`scripts/m7b1-native-proxy.mjs` is an inert adaptation of the previously accepted M7A proxy. Root may start it only inside the exact private API network namespace, after the build/manifest review, with `M7B1_REVIEWED_PROXY=1` and a new mode 0600 `M7B1_PROXY_PLAN`. Its fields are `apiPid,apiId,apiPort,backendSourceCommit,publishManifestSha256,uiCommit,staticRoot,files,databaseName,privatePgSystemIdentifier`; copy the manifest's exact files object. TLS cert/key live only in the private package.

The proxy binds HTTPS 127.0.0.1 on a new ephemeral port, serves the pinned original UI including extensionless SPA routes/querystrings, and forwards actual `/api/` requests to the isolated API. It never injects actor headers, manufactures responses or logs authentication bodies/cookies. It rejects test/private identity aliases, verifies namespace and every static file, expires in 30 minutes, and writes a new exclusive protected receipt. No production route/alias is changed. Root pins/reviews the helper source hash and proxy receipt before the browser.

## Phase D — protected harness admission

`playwright.m7b1-native.config.ts` selects exactly one phase (`M7B1_NATIVE_MODE=fresh|retained`), Chromium worker 1, retries 0, maxFailures 1, timeout 300s. Traces, screenshots and video are off; no HAR/auth/body/cookie logging. All new contexts use normal Core login cookies. `input.ts` fails closed before a business command unless reviewed inputs, hashes, namespace, origin, artifact pins and new result paths match.

All input files must be regular, real absolute paths, mode 0600 and at most 1 MiB. Their environment names each require a matching `_SHA256`:

| Input | Required shape / binding |
| --- | --- |
| `M7B1_NATIVE_FIXTURE` | `schemaVersion:1,purpose:'M7B1_FRESH_UI_CLONE',database,privatePgSystemIdentifier` as exact string, `tenantId,companyId,branchId,eventId,originalMakerPrincipalId,originalEventVersion,users` (B/C: actual `id,email,password,displayName,workerId:null`); plus actual prep assertions below. Never print this file. |
| Fixture prep assertions | `clonedFromOriginalSource231:true,copiedFromMutatedNativeGraph:false,sqlSeededRoundBusinessRows:false,originalSourceTableCount:231,beforeUiRoundCounts:{<six table names>:0},genuineUpApplied:true,expectedOwnerErp:true,erpProcurementSchemaUsageVerified:true,finiteProfile:'107',preparationReceiptSha256,sourceBusinessBaselineSha256`. These describe proven pre-UI preparation, not current retained-state row counts. |
| `M7B1_NATIVE_RUNTIME` | Actual full container `id`, full `backendSourceCommit`, `publishManifestSha256`, live `networkNamespaceOwnerPid`; matches the clone/proxy/publication. |
| `M7B1_NATIVE_PROXY_RECEIPT` | Actual HTTPS 127.0.0.1 origin, container/database/system/source pins, unexpired normal-local-cookie transport, no identity injection/response mocks, exact files manifest. |
| `M7B1_NATIVE_UI_MANIFEST` | Actual successful product build manifest from Phase B, same product SHA and files. |
| `M7B1_NATIVE_OWNER_RECONCILIATION` (retained phase only) | Root's actual post-fresh proof: `passed:true,databaseName,uiSourceCommit,backendSourceCommit,exactlyThreeBrowserCommands:true,roundPlanVersion:3,roundPlanStatus:'Cancelled',commands:[{actorIndex,operation,originalKey,responseSha256},...]`. Exactly B Create and C Revise/Cancel, three distinct original keys. |

Also require `M7B1_NATIVE_REVIEWED_EXECUTION=1`, actual `M7B1_NATIVE_EXPECTED_DATABASE`, full 40-character `M7B1_NATIVE_BACKEND_SOURCE_COMMIT`, and a new absolute result filename under an existing 0700 private directory (`M7B1_NATIVE_FRESH_RESULT` or `M7B1_NATIVE_READ_RESULT`). No output overwrite. Fresh admission additionally requires Root approval `M7B1_PREPARED_CLIENT_RECOVERY=1` for the limited client fixture below. Debug/trace environments are rejected. Root owns all generation/permissions of actual private inputs.

After SDK is terminal and inputs/proxy ready, first perform a bounded harness-only typecheck in the test checkout using existing dependencies (these files are outside the app's ordinary tsconfig include). Root reviews any errors before browser start. A suitable command is `tsc --noEmit --strict --skipLibCheck --moduleResolution bundler --module ESNext --target ES2022 --lib ES2022,DOM --types node playwright.m7b1-native.config.ts tests/normal-cookie/m7b1/input.ts tests/normal-cookie/m7b1/fresh.spec.ts tests/normal-cookie/m7b1/retained.spec.ts`. This command has not run.

## Phase E — one fresh actual-UI journey

`fresh.spec.ts` does not create/clone/migrate/start anything. Run once on the admitted fresh clone; no automatic retries or business response substitutions.

1. B logs in through actual `/api/hrm/auth/login`, confirms actual `/auth/me`, company/branch context, workerId null, the three named grants and literal Read/Record capabilities. Open the existing RFQ directory's planning-source tab, then actual original detail/Items. Confirm unenrolled Draft/current event version/Create hint before any business command.
2. Through shared original forms, B explicitly saves an incomplete proposal with requirements/disclosure/document text, browser-local schedule, one mandatory and one technical weighted criterion (`12.3456`, minimum `0.0001`, maximum `10.0001`), and actual C from the scoped Core picker. No policy adoption or business defaults are implied. Actual Create 201 supplies the original key and receipt hash; reload verifies current/version 1 content and newest historical view has no actions.
3. Prepared client recovery: before forwarding the actual POST, the harness observes the product's own already-claimed metadata locator. After actual success/reload, it restores that exact observed locator to sessionStorage, reloads, clicks Check saved result, and requires the actual original GET 201/raw response hash. This is explicitly **prepared client recovery state**, not a claim that a network response was lost in this run. No business body, response, identity or saved ERP record is fabricated; no extra POST is permitted. If the product locator cannot be observed, the request is blocked before forwarding.
4. While the plan is still Draft/version 1, B uses the actual Organisation context picker to select All. The actual UI request must carry All, return the same Draft with empty actions, and show retained current/history with no Revise/Cancel button. B logs out; C starts a new normal-cookie selected-branch context.
5. C opens the retained plan, verifies full fields, removes the mandatory criterion and changes the technical weight to `15.1234`. Exactly one actual Revise 200. Reload and exact version reads verify the surviving logical ID, deliberate dropped criterion, unchanged participants/requirements/schedule and C attribution. Open original version 1 and latest version 2 as immutable historical views.
6. C opens Cancel, verifies the button is disabled until a reason is entered, and issues exactly one Cancel 200. Reload/history version 3 verifies Cancelled plan, unchanged full version 2 content, three distinct physical revision IDs, no further plan write buttons, and source event still original Draft/version with holds not released. Read All/current/history again.

The request guard forwards actual allowed commands unchanged, records keys/status/hash, and blocks unexpected/repeated business writes before forwarding. Expected budget is exactly three commands: B Create 201, C Revise 200, C Cancel 200. Authentication login/logout POSTs are tracked separately. Any assertion/timeout produces only safe failure codes plus message hashes in a fresh0600 protected receipt; no auth/body/selector data is printed. The final UI status still requires independent owner reconciliation.

For execution Root uses the existing Node22 binary with one worker/nice 10/heap512 inside the API network namespace, for example `nsenter --target <reviewed API PID> --net ... node ./node_modules/@playwright/test/cli.js test --config playwright.m7b1-native.config.ts`. Load protected environment from Root's reviewed private file; never echo credentials or put passwords on the command line. Start with at least 1.5 GiB available, no SDK, one API and proxy; stop on material pressure/under 500 MiB. No concurrent build or second browser worker.

## Phase F — owner reconciliation, then retained read-only browser

Root independently reconciles the three original keys and raw response hashes to actual stored receipts, current versions and audit/outbox. Expected B1 graph for the prepared forms is one enrollment, one Cancelled/version 3 plan, three revisions and receipts, four physical criterion rows (2+1+1), three participant rows (1+1+1), and three owning audit/outbox pairs. Verify stable logical IDs, distinct immutable physical IDs, plan maker B, revision actors B/C/C, worker aliases null, byte-exact version 2/cancellation content, original maker A/source version/state unchanged, approved demand holds still Reserved, and zero new invitations/contacts/quotes/awards/Core review/Finance effects. Count and fingerprint all other relevant source business records against the actual baseline. Normal Core auth sessions are separate authorized fixture/authentication effects.

Only after that proof may Root admit `retained.spec.ts` on the same coherent fixture, new output filename. It uses fresh B/C normal cookies, branch and actual All UI/history reads, zero business POSTs, no editor people lookup, and real GET receipts: own original status/hash must match; cross-actor receipt GET 404 must remain private. If Root chooses a Read-on/Record-off restart, pin its new runtime/proxy and set `M7B1_EXPECT_RECORD_OFF=1`; the test then requires actual metadata Read=true/Record=false. Without that flag it claims retained/All reads only, not a flag-off experiment. Root owns any flags/restart and final zero-business-effect reconciliation.

## Failure and cleanup boundary

Stop at the first failure. Preserve initial failure/started-command ledger and exact inputs/artifacts. Never rerun fresh Create on a retained graph, reuse a result filename, recreate the DB to hide a failure or automatically generate another POST key. Root first reconciles actual rows/receipts. If necessary prepare a separately approved narrow continuation with the remaining command budget; unresolved original keys are recovered by GET only. Keep the earlier native Create 503 evidence independent from this new UI clone.

Root later revokes only the isolated synthetic authentication cohort, restores fixture changes where required, stops its private API/proxy and retains evidence/releases. No production user, database, flag, policy, deployment alias or container is changed by these preparation files. Build/harness/native results and an actual artifact manifest remain **pending** until those reviewed phases run.


## Preserved first actual UI attempt and All-scope successor

The first actual browser attempt used immutable product `8dca4943`; B Create 201, reload/current/newest-history read and prepared original-key GET 201 recovery succeeded. The active-Draft All transition then failed: the shell stores All with `branch:""`, while the round identity hook incorrectly preserved that empty string via `?? null`, causing an invalid-GUID render error. Root preserved the failed browser result and stopped runtime/proxy; independent owner reconciliation confirmed the actual version 1 graph and no unowned business effects. Do not rerun Fresh/Create or replace this DB.

Product successor `26d4ef1924b508a4ca33a184ec21500691003b3f` normalizes the shell's empty branch to null, retaining strict checks for nonempty IDs. The actual-shell-shape API regression and existing scope tests passed37/37; product typecheck passed. Original8dca artifacts/failure/key remain unchanged. Successor build evidence is separate. Root owns restart and a separately admitted continuation: first B All/version 1/originalCreateGET 201 reads, then only C Revise/Cancel. m6D owns the separate continuation files; no new Create or DB reset is allowed.

Existing Fresh/Retained init scripts now compare `location.origin` with the exact admitted HTTPS origin before touching localStorage; about:blank or another origin returns without access, and errors on the approved origin are not swallowed. If a protected credential fixture lacks a display name, Fresh obtains the actual C label through bounded scoped people GETs within B's existing normal session, then still selects C through the real UI picker. No name/identity is invented. Fresh is historical preparation only on the retained version 1 fixture; do not execute it again.


## Actual private browser results — preserve both attempts

The original normal-cookie Fresh run on product `8dca` failed at the active-Draft All transition, after actual B Create 201/version 1, reload/current/latest-history checks and explicitly prepared-client original-key GET 201 recovery succeeded. Its result SHA256 is `70810c4f8e30f02d4fccfe2691d20509dad6a3a930aea5f7fbb8f849377da763`; the failure/all-stop receipt is `5484ff47435668252bb7293eae6c3cbb90fc36eeec76b295aa1dfd3d360a1421`. The recorded page error/response timeout was the real empty-branch identity bug described above. Root preserved the graph, failed result, inputs, original key and old artifacts; it did not recreate the DB or rerun Create. Independent version 1 business/auth integrity proof `8751520e5c05c859c7c321b23d5a9113918851527713c1e12064139d08509bb9` was limited proof, explicitly not whole-UI acceptance.

The corrected `26d4` offline build passed typecheck/Vite at 512 MiB; its separate five-file manifest is `b32bbf80818649906aff993fbfa8666d0334899ecd4dcddec8358dd46777c61c` and static-build proof `c7a28cc52537ebf9202b7a36448f7874c72e795065b9a46a96834195b10addb5`. Root restarted the same isolated API/source `0f9` publication 28 and used a new proxy/input directory. The continuation was separately admitted against the actual retained version 1 and budgeted only the remaining two commands.

Root's actual continuation Playwright run completed exit 0 with result SHA256 `b8041ebe50fa4a78cfcdd452927dd43f5f57b91c67ec9c303f634f88737fef6c`:

- B's actual All read of active Draft/version 1 and immutable history passed; original actor Create GET returned 201.
- C's normal-cookie full-set Revise and Cancel each returned 200. Deliberate criterion removal/stable logical identity and retained content/version checks passed.
- C's original B Create receipt GET returned 404, preserving actor privacy. C's retained All/current/history reads passed.
- No unexpected business writes, identity aliases or business response substitutions; pageErrors 0. The continuation's B/C normal login/logout statuses were 200. The initial Fresh B session remains separately recorded; do not misstate the complete history as only this continuation's two sessions.

Root then stopped the exact private API/proxy; all-stop receipt SHA256 `31f2fd2a4fcb1fb8e63a4a693b0386e31f2c73bbc75db9db8547693c4e698cb2`. Protected evidence remains in Root's private runtime packet; no credential, cookie, actual native row IDs or business payload is copied into Git.

This is successful **private UI continuation evidence across a preserved failed initial attempt and a narrowly corrected product**. The result itself says `PASS_NATIVE_UI_V1_CONTINUATION_TWO_COMMANDS_AWAIT_OWNER` and requires independent native owner reconciliation of the full three-command graph, receipts/audit/outbox, auth cleanup and unchanged source before final acceptance. That final proof, paired release and production UAT remain pending here. No whole Procurement module completion or production activation is claimed; parent 145 remains open. Do not run Fresh again against this graph.
