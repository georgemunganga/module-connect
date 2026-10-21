# Actual Budget browser acceptance contract

Source-only/unrun. Frontend base9d9b4c5; backend fixture source extends root740a629 using existing ApprovalHttpPostgresProbe --serve --orders. No application source changes. The verified exact Budget bundle (JS index-JuvMCZhV.js, CSS index-Bddc462I.css) remains frozen in its original worktree; tests/config/docs here must not overwrite it.

## What is real

Actual HTTP-created/submitted, unfunded/unapproved PR has quantity1.0001 × unitPrice0.0001 = exact0.00010001 ZMW. The existing actual Finance principal/current Core grants and selected branch access the real queue with currentCAS version and retained businessVersion. Procurement context/meta and all business reads/commands are forwarded unchanged to the actual API; only ERP shell presentation/auth display is synthetic.

The browser chooses the named source from a queue that may contain other fixture requests. It asserts raw numeric8dp wire, blank checked amount/no default outcome, client rejection of under-covering0.0001 without POST, then explicit reviewed0.0002 string/currentCAS POST201 and history retained businessVersion. Exactly one Procurement POST is allowed; no approval/payment/PO authority is inferred. Retain actual-budget-api-traffic.json as0600 and its raw response text to prove lossless forwarding.

## Setup and serial operation

1. Root builds reviewed fixture source and provisions a NEW private proc_approval_http_* database with actual migrations, separate owner/runtime roles and finite actors. Start existing --serve --orders with PROCUREMENT_BUDGET_BROWSER_VERIFY_ON_STOP=1. Do not set ORDER_BROWSER_VERIFY_ON_STOP for a Budget-only run; its independent owner proof requires its own PO UI workflow.
2. Set PROCUREMENT_APPROVAL_BROWSER_MANIFEST to the fresh owner-private manifest with budget member. The test validates loopback URL/header/tenant/currency/constants/IDs/versions and real Finance permission. It starts no backend or database.
3. Root verifies port3045 free and supplies the retained, hash-checked exact Budget assets at this worktree's reference-ui/.budget-verification-dist using an explicit reviewed read-only link/copy. Preserve original frozen assets and all previous mock results. No optional app rebuild or deployment is authorized.
4. With cached Node22, heap512, one worker and explicit host clearance, run from reference-ui:

   ```sh
   NODE_OPTIONS=--max-old-space-size=512 nice -n 10 ./node_modules/.bin/playwright test --config playwright.budget-backend.config.ts --workers=1 --max-failures=1 --reporter=list
   ```

5. Preserve source SHA/asset hashes/terminal log and fresh .budget-backend-results including first failure trace/screenshot. No timeout increase, automatic POST retry or fixture reuse after a partial run.
6. Notify root after all calls stop; root gracefully stops server. Independent owner verifier must pass: exact original full source digest/counters/Submitted state unchanged, one0.0002 bound schema1 Finance snapshot/audit with actual canonical independent checker/hash, no Core case/pin/outcome/allocation, all other tracked effect counts unchanged.

Browser success alone is insufficient. External Finance funding authority and production authentication are not supplied by this synthetic fixture; no AP/payment ledger, ready provider or PR approval is invented. Existing restricted P27 CLI verification stays a separate gate. Author executed no jobs.
