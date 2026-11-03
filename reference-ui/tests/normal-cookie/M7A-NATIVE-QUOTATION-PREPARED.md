# Prepared M7A native quotation UI journeys

These tests are prepared for Root's isolated API/TLS proxy. They have not been executed by the UI implementation agent. Root owns database clones, real Core grants, runtime/proxy admission, cookie cohort reconciliation and native owner verification. Never run these against production or reuse an existing supplier draft for the fresh journey.

Both configurations require Node 22, one worker, zero retries, protected input files (absolute canonical paths, mode 0600, SHA256 pins), a fresh result path under a mode 0700 directory and a reviewed normal-cookie HTTPS proxy on 127.0.0.1. Trace, video, screenshots and debug logging stay off. Credentials are read only from the protected fixture and sent only to normal login; they are not embedded in browser init scripts, evidence, screenshots or logs. Initial browser storage contains only the legitimate company/branch selection.

Required environment variables:

- `M7A_NATIVE_CLONE` and `M7A_NATIVE_CLONE_SHA256`: Root's dedicated clone fixture, including company, branch, event and exactly two workerless B/C accounts.
- `M7A_NATIVE_RUNTIME` and `M7A_NATIVE_RUNTIME_SHA256`: the exact current runtime-created receipt.
- `M7A_NATIVE_PROXY_RECEIPT` and `M7A_NATIVE_PROXY_RECEIPT_SHA256`: Root's admitted TLS proxy receipt.
- `M7A_NATIVE_EXPECTED_DATABASE`: the exact dedicated database name; must match fixture and proxy receipt.
- `M7A_NATIVE_UI_SOURCE_COMMIT`: the reviewed UI commit; must match the proxy receipt.

The proxy receipt must identify `origin`, `databaseName`, `backendContainerId`, `uiSourceCommit`, `expiresAt`, `transport=normal-local-cookie-https-v1`, `injectsIdentityHeaders=false` and `mocksBusinessResponses=false`. It must serve RFQ SPA paths with `?source=quotations` and preserve owning API status/body/cookie bytes. The tests do not start servers, containers or proxies.

## Retained read/history journey

Set `M7A_NATIVE_READ_RESULT` to a new private result file. Default expected quotation status is Cancelled; Root may set `M7A_NATIVE_EXPECTED_STATUS=Draft` when that is the intended retained state. Dropped-line acceptance is opt-in only with `M7A_NATIVE_EXPECT_DROPPED_LINE=1`; the existing one-line native cohort makes no dropped-line claim.

```sh
./node_modules/.bin/playwright test --config playwright.m7a-native-read.config.ts
```

B and C log in normally, read assigned quotation work without maker or employee dependencies, view current and original versions in the existing UI, verify cancellation retains the preceding offer/lines/documents/totals, and read/reload under Company All. An abort-only method guard forwards every GET unchanged and prevents attempted business writes. Only normal login/logout changes authentication sessions. The receipt records hashes, counts and statuses, without credentials or supplier offer bodies.

## Fresh complete draft journey

Root must provide a new clone with the untouched single-line published RFQ and its fresh invitation, normal B/C identities and explicit contact/capture/cancel actions as needed. Set `M7A_NATIVE_WORKFLOW_RESULT` to a new private result file.

```sh
./node_modules/.bin/playwright test --config playwright.m7a-native-workflow.config.ts
```

B records actual outside contact, enters the full supplier offer and exact line terms through the original UI, saves and reloads. C logs in separately, revises the retained full offer with a reason, reads original history, cancels with a reason, and reloads the cancelled record. The finite request guard allows exactly one actual POST for each of contact/create/revise/cancel and forwards every response unchanged. It never fulfils or substitutes business responses. Commands must receive the owning 201/201/200/200 statuses and distinct original command keys. No quotation draft is recreated; no line-removal claim is made for the one-line source.

A browser PASS is an actual UI/API checkpoint, with native owner reconciliation still required before workflow acceptance. Any failure leaves the original command references in the protected receipt for Root review; the test has no automatic business-command retry.
