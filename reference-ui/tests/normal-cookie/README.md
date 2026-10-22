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
5. Typed 0600 results retain actual record/line IDs, versions and allowlisted
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
