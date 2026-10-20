# Buying method purchase route — UI candidate

Status: source candidate; not built, browser-verified or published.

Extends the existing Buying categories & methods page and shared Select/table components.
Matches the `ExecutionRoute` contract in the backend initial purchase-order source.

- Draft methods explicitly select Not configured, Direct purchase, Quotes or tender,
  or Existing contract. The route is separate from the method code and approval policy.
- Existing values are retained when editing name/description. Unknown future routes
  remain read-only instead of being replaced by an implicit default.
- Saving a route does not activate the method, approve spending or enable an
  unimplemented sourcing/contract/order workflow.
- Mutation responses must confirm the requested route. A legacy API that omits a
  selected non-default route produces an unconfirmed-result message; no automatic retry.
- Company/branch headers, backend permissions, independent activation and optimistic
  version checks remain the existing configuration contracts.

Acceptance source: `reference-ui/tests/e2e/live-configuration.spec.ts` includes route
preservation, unsupported-route protection and legacy-API confirmation scenarios.
Run TypeScript, the staged live build and this focused Playwright file before merging.
Actual backend acceptance requires the matching PO API candidate; mocked browser
coverage alone does not establish persistence or production readiness.
