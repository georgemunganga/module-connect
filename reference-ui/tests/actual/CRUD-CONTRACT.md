# Actual private CRUD browser gate

This opt-in project serves the already-built `.verification-dist` unchanged. It proxies every `/api/` request to the actual private tool Unix socket; it contains no Procurement response mocks. The tool's Core shell endpoints use actual fixture company/user/branch facts and explicitly synthetic branding. Its ERP administrator fixture and synthetic approved supplier do not prove finite-role or supplier-approval workflows.

Required environment:

- `CRUD_BROWSER_FIXTURE`: absolute protected manifest (0600), published only after actual CLI proof passes.
- `CRUD_BROWSER_SOCKET`: absolute actual host Unix socket path for tool `/crud-browser-socket/api.sock`.
- `CRUD_BROWSER_DIST`: optional staged candidate directory, default `.verification-dist`.

Run from `reference-ui` only after root allocates resources:

```
./node_modules/.bin/playwright test --config playwright.actual-crud.config.ts
```

The separate project is not part of default mocked e2e discovery. Without both required environment variables its tests explicitly skip; the proxy never starts. It binds only 127.0.0.1:3027, forwards actual browser Core scope headers, overrides only the fixture authentication header and does not expose a database connection string. Static serving rejects traversal and symlink escape from the staged root.

Seven authored cases: vendor create/edit/withdraw; inactive catalog draft create/edit (no fabricated approval or redundant deactivate UI); request draft create/edit/withdraw; invoice create/exact edit/cancel; buying category create/edit/retire; procurement plan create/edit/cancel; supplier contract create/edit/cancel. Each reloads real reads and queries its retained row through an independent owning PostgreSQL session. No RFQ/PO approval, Finance posting, receiving or full module completion is claimed.

Owner observation uses fixed allowlisted tables, actual response UUIDs, a validated `procurement_crud_http_` database and only SELECT through `docker exec procurement-approval-rehearsal-postgres psql`. It does not write fixture records, create/drop databases, alter schemas or stop root's tool. Root owns server/database lifecycle and subsequent independent whole-store verification.

Source authored only until executed results and candidate asset hashes are recorded. Keep failed traces; no automatic retries. Tool bootstrap precreates its own independently verified CLI records, so browser cases use unique BROWSER-prefixed names and do not assume empty lists.

## Supplier lifecycle extension (authored, not runtime proof yet)

`actual-supplier-lifecycle.spec.ts` adds one case to the existing 12-case cohort, reusing the existing vendor pages and buttons. It requires a newer protected manifest with:

```json
{
  "workerId": null,
  "browserActorSwitch": "manifest-alias-v1",
  "actors": {
    "systemReviewer": { "principalId": "<actual seeded Core UUID distinct from actorId>", "workerId": null }
  }
}
```

The actual probe owns seeding, the finite stored reviewer grants, branch assignment, CLI proof and its fixed authentication allowlist. The browser never creates a user, changes a role or writes through PostgreSQL. Absence of this extension fails the new proof explicitly; it does not silently skip it or manufacture employee identities.

The private loopback proxy accepts only the exact `X-Crud-Browser-Actor: systemReviewer` alias when this manifest opts in. It resolves that alias solely from the protected manifest, removes the alias header and overwrites `X-Crud-Actor` with the declared UUID. Unknown aliases, raw UUID aliases, malformed/missing reviewer declarations and incomplete proof reject before the upstream call. Requests without the alias retain the original maker behavior. No production authentication handler or application code uses this selector.

The case uses distinct browser contexts for maker and reviewer. Both must report the actual expected Core principal and `workerId: null` from the real Procurement context endpoint. It creates and submits through the existing form, confirms no self-approval button, verifies direct self-approval is rejected without owning-store changes, returns for information, edits and resubmits, independently approves, then places the vendor on hold after reviewing open orders. PostgreSQL SELECT-only evidence checks retained creator, exact ordered state/actor/reason decisions and final non-orderable state. No bank verification, payment, Finance posting, portal or overall module-completion claim is made.

A separate reviewer trace is attached on success or failure. Run with one worker, zero retries and preserved failure artifacts after root allocates resources and confirms the actual seed/tool contract. Pure selector regression tests are in `scripts/crud-browser-actors.test.mjs`; they do not mock Procurement business responses. Application source and the already frozen static bundle remain unchanged.
