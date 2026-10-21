# Actual sourcing authority settings browser gate

**Authored source only, unexecuted.** Application source is the existing `e366f78` RFQ approvals settings adapter; only this contract and `sourcing-authority.spec.ts` are added. No app changes, installs, assets, API/server or database lifecycle actions.

Operator provides a fresh private `ApprovalHttpPostgresProbe --serve --settings` sourcing-authority fixture using `PROCUREMENT_APPROVAL_BROWSER_MANIFEST`. Existing backend browser configuration runs one worker against the exact parent-approved staged application assets. Parent owns sequencing, the real runtime role, migrations, fixture start/stop, and independent final persisted-owner checks. Do not reuse an already-mutated settings fixture.

## Agreed manifest

Existing `baseUrl` is loopback HTTP 127.0.0.1 with a port; `tenantId: probe`, `companyId`, `branchId`, `currencyCode: ZMW`, `authenticationHeader: X-Probe-User`. `actors.maker` and `.reviewer` each contain canonical `principalId`, `workerId`, raw real Procurement `context`. They are distinct active Core workers with finite configuration roles, not ERP administrators. Named manager2 is separate from both; having the sourcing action initially does not itself supply a finite active limit.

`sourcingAuthority`:

- `authorityReference: BROWSER-SOURCING-LIMIT`
- `principalId`: existing manager2; `principalDisplayName: manager2`
- `maximumAmount: "1.2345"`, `currencyCode: ZMW`, `branchId`: selected fixture branch
- `expectedAction: SourcingEvent.Publish`, `amountBasis: ApprovedLineBase`
- `activationReason: Browser independent sourcing limit approved`

The fixture starts without an authority, policy, request or operational RFQ effect for this workflow. Its backend owner verifier must check exactly one grant at version3/Active, original named identity, amount/currency/branch scope, independent activation and retained audit, plus unchanged other Procurement/Core approval tables. Browser assertions do not replace owner verification.

## Workflow and boundary

Use the existing `/settings/modules/request-for-quotes/approvals` route, Approval limits tab. Maker selects actual named manager2, enters exact string1.2345, retains CoreZMW and selected branch, explicitly selects all departments/categories, then saves Draft201. Submit that original ID through the existing reason/action dialog. Reload as the independent reviewer; Activate requires explicit reason, then reload and scoped real GET verify originalID/name/stringamount/Active/version3. Exactly three mutations (create/submit/activate), no automatic retries, synthetic idempotency key or lost-response claim.

Every Procurement request—including context/meta, policy/readiness discovery while entering the shared page, authority list/person lookup/detail and lifecycle commands—is forwarded unchanged to the actual API with fixture actor and selected Core headers. Only outer HRM auth, branding and shell presentation are synthetic. No authority response, capability or source permission is mocked. This configures a limit; it does not execute RFQ publication, invitations, Finance effects or Core approval decisions.

Real traffic is recorded to a concrete0600 artifact on success or failure; failure traces are retained. Run `sourcing-authority.spec.ts` only after parent confirms the fresh manifest and resource slot. This source commit ran only `git diff --check`, with no TypeScript/build/browser/API/DB verification claimed.
