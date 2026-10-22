# P24 actual recurring purchase browser acceptance

**Source only; no Node/build/browser execution yet.** Reuses `playwright.actual-crud.config.ts`, the current `crud-browser-proxy.mjs`, actual private ProcurementCrudHttpProbe host/Unix socket and the existing read-only owner observer. No new runner, frontend, API business mocks or production identity changes.

Required new manifest fields on the existing protected actual CRUD fixture:

```json
{
  "fixtureKind": "recurring-purchases-v1",
  "browserActorSwitch": "manifest-alias-v1",
  "otherBranchId": "<actual same-company branch not assigned to planner>",
  "defaultCurrencyCode": "<actual Core company default>",
  "actors": {
    "recurringPlanner": { "principalId": "<genuine seeded Core account distinct from default actor>", "workerId": null },
    "systemReviewer": { "principalId": "<existing distinct Core supplier reviewer without recurring actions>", "workerId": null }
  }
}
```

Existing database name/productionfalse/cliProofComplete/socket requirements remain mandatory. Actual backend preparation must prove the default actor's current recurring read/edit permissions before exposing this fixture: a404 against planner-owned records then proves ownership rather than missing permission. Planner grants are finite current Core actions, not a role header; employee is optional. The fixed planner alias is accepted only when the fixture kind and actor-switch marker match. Raw UUIDs, arbitrary aliases/roles, missing proof and duplicate/default identity are denied by the private proxy before forwarding. SystemReviewer alias behavior remains unchanged. Backend tool must also allow only manifest-declared identities. This is explicit synthetic outer authentication, not production sign-in proof.

Run only after parent gives the CPU slot and genuine P24/provider/tool proofs pass. Build a source-pinned live bundle with Node22 and freeze its full tree first; set the existing `CRUD_BROWSER_DIST`, `CRUD_BROWSER_FIXTURE` and `CRUD_BROWSER_SOCKET` protected paths, then use the existing config with explicit `tests/actual/actual-recurring-purchases.spec.ts --workers=1 --retries=0 --max-failures=1`. Retain traces on success/failure and all owner evidence; do not run against production or reuse another listener. This new source is not covered by earlier13P22 or P23 review browser results.

## Actual assertions

- Actual context validates planner principal, workerIdnull, selected company and exact needed action permissions. All real business/context/meta requests go through the existing proxy/Unix host. No `page.route` business replacement in the normal journey.
- Existing supplier chooser, currency default, shared form/detail/table and normal buttons create exact amount/date schedule→reload→edit→unchanged PUT consuming exact+1→close→closed read-only. Actual handler responses and fresh owner rows agree.
- Default actor with proven actual read/edit grants cannot read/update another owner's row; planner cannot use unassigned branch; current supplier-only reviewer cannot list/create recurring purchases. Independent owning row/audit/outbox fingerprint stays unchanged by denials. No dynamic mid-browser revocation is claimed.
- Independent fixed-table SQL observer retains row/exact numeric text/audit/outbox; only SELECT is used. Ordered explicit audit actions are PlanCreated, PlanUpdated, PlanUpdated, PlanClosed. Closed update409 leaves proof unchanged.
- Supplier-invoice, PO, Finance handoff/payment and budget row counts remain unchanged. CLI probe separately owns supplier/contract conflict, contract reparent serialization race, malformed input and full provider/schema proof; these browser cases do not replace that coverage.
- Separate fresh browser context deliberately forwards an actual create through the same proxy, waits for the REAL201 and actual returned row, retains it, then drops only browser delivery. No fabricated successful response or retry. Reload keeps opaque actor/company/branch/new-target session marker, disables Save, and sends no second POST. Actual GET/owner SELECT confirms exactly one matching row. A read does not clear the lock.

The API currently has no server command-idempotency/recovery endpoint for this draft CRUD. Browser session protection is conservative and single-session only, not exactly-once/cross-tab protection or automatic reconciliation. Lost-delivery evidence explicitly records this limit. It neither creates AP bills/payments nor enables a recurring scheduler, import, tax line or ledger.

All failure artifacts and exact source/bundle/API/schema pins must be retained. `cliProofComplete` and fixture mode are admission checks, never substitutes for running and inspecting the browser results. A supplied wrong fixture fails rather than silently certifying/skipping acceptance.
