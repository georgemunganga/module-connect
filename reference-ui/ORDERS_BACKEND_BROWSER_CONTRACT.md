# Actual order browser workflow — verification source

Status: source candidate; no browser, build, server or database job run in this increment.
Frontend base613ae83; backend sandbox basee752ed1 plus the order-browser fixture increment.

Use a fresh private manifest from the actual backend `--serve --orders` mode after its
centralized build/migration/runtime-role gates pass. The fixture alone approves its source
PR through real commands before the browser; no Approved PR/Core votes are fabricated.
The browser performs every PO happy-path command through existing UI controls:

1. Buyer selects the untouched approved source and active vendor, quantity1/unit price100.
2. Independent Finance confirms exact100 ZMW and the original PR reservation reference.
3. Buyer submits the linked order for the configured commercial approval.
4. PO-only assigned reviewer opens Approvals → Review order approval and approves.
5. Buyer authorises sending; order is only IssuePending, with no delivery evidence.
6. Independent sending operator records verified SecureEmail outcome; order becomes Issued.

All Procurement context, meta, list/detail, lookup, command and history responses are real
mapped backend responses forwarded over loopback. No Procurement response mocking or
client-granted permission is allowed. Only ERP shell authentication/branding presentation
has a synthetic fixture. The private manifest rejects public URLs/non-probe tenants and
records canonical synthetic people/company/branch context; it contains no credentials.

The test checks Finance lacks PO-read and the reviewer lacks PO-read/PR-read/PR-approval
permissions, then uses purpose-specific reads. PO-only UI traffic must not call PR request
or approval endpoints. Six writes have distinct stable UUID command keys and independent
actor order. Exact string money and line quantities, original Finance reservation reference,
one case/submission/decision/Finance/issued/delivery evidence and exhausted source quantity
are asserted through actual API reads. Exact delivery replay must not add evidence.

For persisted database proof, start the backend with
`PROCUREMENT_ORDER_BROWSER_VERIFY_ON_STOP=1` and gracefully stop it after the browser.
Its owner-only inspection checks conserved source counters and exactly one related effect
of each type, expected canonical principals and exact100 ZMW. This inspection does not
broaden the HTTP runtime's grants or add a test endpoint to production.

After source, unit, TypeScript, staged assets and backend gates clear, the coordinator may run:

```sh
PROCUREMENT_APPROVAL_BROWSER_MANIFEST=/absolute/private/manifest.json \
  ./node_modules/.bin/playwright test tests/backend-browser/orders.spec.ts \
  --config playwright.backend.config.ts
```

Never reuse this consumed fixture for another PO run or the PR/settings browser flow.
Retain traffic/trace and first failures; a compiled source or mocked browser test does not
prove this actual workflow. Automated Finance/payment, receiving, amendments and other
unsupported order routes are outside this bounded test and remain separately gated.
