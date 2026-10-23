# P25 normal-cookie draft browser prerequisite

Source only; no browser, API, TLS server or build has been run for this branch.
This is the existing UI's request draft CRUD prerequisite, not P25 approval or
SSO acceptance. No application UI/transport/backend changes are included.

## Root-owned launch prerequisites

- Reviewed source `2313038` normal-local-cookie control plane must actually be
  running in a new private clone with network disabled, with its real local password
  handler/session cookie and finite record/execution connections. The fixture's
  private-subject setup remains explicitly synthetic and separate from browser
  authentication.
- Root provides the exact runtime PID and enters its **network namespace only**
  (`nsenter -t <verified owned runtime PID> -n`), keeping the host filesystem.
  Node proxy and Chromium must both run there. No host/public port mappings,
  network enabling, owner connection strings or production URLs. The database must
  match the actual P25 tool allowlist `^proc_p25_http_[a-z0-9_]{1,48}$` and the
  separately supplied exact expected database (planned root target
  `proc_p25_http_20261022_localcookie01`).
- A fresh 0700 host evidence directory, regular 0600 local-cookie fixture and TLS
  certificate/key; root generates a private certificate valid for 127.0.0.1
  (localhost optional). No key generation/pull/login/build is done by these files.
- Exact already-built static candidate directory, supplied through an absolute
  `P25_COOKIE_DIST`. No Vite development server, source rebuild or install.
- Disable DEBUG, PWDEBUG and NODE_DEBUG. Trace/HAR/video/screenshots and exported
  storageState are forbidden, including on failure. The test uses real login via
  context.request and the automatically shared secure cookie; it never injects
  cookies or an identity/role/private actor header. API transport/JSON exceptions
  are sanitized without original message/cause. Contexts close before a bounded
  failure is thrown, preventing authenticated failure DOM snapshots.

Root sets these inputs (absolute paths where applicable):

```text
P25_COOKIE_FIXTURE          actual protected local-cookie-fixture.private.json
P25_COOKIE_EXPECTED_DATABASE exact reviewed proc_p25_http_ clone name
P25_COOKIE_RUNTIME_PID      actual owned running API PID
P25_COOKIE_TLS_CERT         private regular 0600 certificate
P25_COOKIE_TLS_KEY          private regular 0600 key
P25_COOKIE_DIST             exact prebuilt .verification-dist / frozen copy
P25_COOKIE_PROXY_RECEIPT    new 0600 startup receipt under fresh 0700 directory
P25_COOKIE_BROWSER_RESULT   new 0600 typed browser result under that directory
```

Start `node scripts/p25-cookie-browser-proxy.mjs` in that namespace. It listens
only on HTTPS 127.0.0.1 port 0 and writes its actual origin to the protected startup
receipt; root waits for that receipt/readiness before starting Playwright with
`playwright.p25-cookie.config.ts`. Config does not start a webServer or fixture.
Use one worker, no retries and supported Node 22. Do not publish raw private
manifest, credentials, API headers or login responses in command output/logs.

Proxy static serving reuses the existing crud-browser-proxy's scoped workspace
path, realpath/traversal protection, MIME and SPA fallback approach. Every /api
request is forwarded unchanged in body and actual Cookie/Set-Cookie entity
bytes. Real X-Shell selection headers are forwarded, not fabricated from the
fixture. Private impersonation aliases are rejected. There are no fake Core
shell/Procurement responses. Private self-signed TLS acceptance applies only to
these test contexts, never global production TLS policy.

## Actual intended assertions

1. Maker normal password login and auth/me identify the actual seeded Core user.
2. Candidate company/branch selection from the manifest is sent as ordinary
   X-Shell client headers to the actual context endpoint. Its authoritative
   response must match real tenant/company/branch/current principal and null
   worker, before the verified selection is persisted for the normal UI.
3. Normal requests list 200 carries those real UI selection headers. New draft
   uses current context.company.currencyCode, exact decimal inputs, real Save
   draft; reload/edit/+1/withdraw/+1 all use actual shared buttons. Withdrawal
   returns to My Requests; reopen the exact saved-purpose link, then reload its
   detail and verify Withdrawn.
4. Separate normal-cookie ungranted user signs in, while actual Procurement
   context/list deny 403. No permission grants or admin aliases are added.
5. Both real contexts perform actual logout200 and subsequent auth/me reports
   authenticated=false; the original maker Procurement context then denies401.
   This verifies normal session revocation with declared legitimate auth writes,
   not a business no-effects claim or simulated cookie clearing.
6. Typed 0600 results retain actual record/line IDs, versions and allowlisted
   exact amounts through every stage; failures keep a bounded failedStep and
   original records. No delete/submit/approval/Finance action or business mock.

The result status `PASS_NORMAL_COOKIE_DRAFT_UI_ONLY` is only a browser assertion
claim after this test actually runs. It leaves ownerCompletionVerified,
fullApprovalFlowVerified, nativeIdentityProviderVerified and externalFinanceAuthority
false. Root must independently prove real persisted record/audit effects using
owner reads, and bind source/static/runtime/test exit evidence. Normal sessions
create declared login/session/heartbeat bookkeeping; do not mislabel that as
unchanged identity storage.

The test does not write the control plane lifecycle completion file. Root owns
that separately reviewed challenge-bound completion, shutdown and final source
preservation. A completion file alone never proves browser acceptance. No raw
fixture or credential-bearing trace is an acceptable proof artifact.

## Full purchase request approval UI journey

The separate `playwright.p25-approval-cookie.config.ts` runs
`p25-cookie-approval.spec.ts` against the same private proxy and fixture. Give it
a **different, new** `P25_COOKIE_BROWSER_RESULT` path. It requires the positive
private P25 setup to have completed before the local-cookie host starts: a real
published `PURCHASE_REQUEST` rule, active `PRIVATE_P25` category, independently
activated spending authority, and six synthetic workerless Core users. It does
not publish a policy or grant authority in the browser. The real configuration
maker reads the effective policy; the maker creates and submits a categorized
request; the configuration maker, with a current separate buyer check grant,
uses the real "Check buying rules" action to persist a matched evaluation;
the separate checker records exact Finance evidence through the UI;
the maker opens the approval; and the named Core approver decides through the
UI. Request and decision are read again after reload.

Use the same private namespace/proxy/Node 22 launch constraints above. Run only
the new config with `npx playwright test --config playwright.p25-approval-cookie.config.ts`
after root has supplied the protected fixture, prebuilt matching UI bundle, and
new result path. The current UI requires additive budget queue fields
`estimatedAmountExact` (up to eight fractional digits) and
`minimumCheckedAmountExact` (the upward numeric(18,4) coverage amount), plus
`checkedAmountExact` on the Finance write response. The checker explicitly
enters the verified amount. If any field is absent or inconsistent, saving is
blocked. The test does not infer external Finance authority from the synthetic
manual evidence policy.

The result can report `PASS_NORMAL_COOKIE_APPROVAL_UI_ONLY` and
`browserApprovalJourneyVerified=true` only after Playwright completes the
normal-cookie journey. `fullApprovalFlowVerified` remains false: root must bind
the Playwright exit, exact static bundle/runtime, and independent owning-store
graph read before claiming a full end-to-end acceptance. The lifecycle
completion file remains root-owned and is never written by this test.

Current happy-path correction: request submission itself persists a matching buying-rule evaluation. Verify its displayed status and the own `policy-status` response; a matched request is intentionally absent from the manual review queue. That queue is for missing/blocked checks, not a compulsory extra approval click. The accepted current journey uses this automatic path before independent funding and final approval. The additional private buyer-role fixture permissions are not a prerequisite to re-evaluate an already matched submission.
# P30 principal purchase order draft

`p30-po-cookie.spec.ts` is an opt-in real local-cookie browser proof for the
existing purchase-order editor and five-tab detail. It requires the protected
P30 PO fixture produced after actual private HTTP/owner setup, a separate HTTPS
loopback proxy receipt bound to those fixture bytes, and a fresh protected
result path. Use `playwright.p30-po-cookie.config.ts` with `P30_PO_COOKIE_FIXTURE`,
`P30_PO_COOKIE_PROXY_RECEIPT`, `P30_PO_COOKIE_EXPECTED_DATABASE`, and
`P30_PO_COOKIE_BROWSER_RESULT`. The proxy script additionally requires its
private TLS files, built UI directory, and the API runtime PID in the same
network namespace. No browser route mocking or identity headers are used.

The test creates one internal draft from the genuine remaining approved line,
reloads, cancels, and reloads again. It records the observed create/cancel
command keys for an independent owning-store verifier. A completion file only
closes the private listener; it does not certify browser or database acceptance.
