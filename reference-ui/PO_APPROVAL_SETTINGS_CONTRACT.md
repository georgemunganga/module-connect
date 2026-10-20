# Purchase order approval setup UI contract

Status: source authored; no Node, type/build, unit, browser, database or deployment verification.
Frontend base: `0339522`. Backend target: `80ff610` (PO + shared settings composition).

## Existing components and ownership

The module-specific Purchase Orders → Approvals settings tab reuses LiveApprovalSettings,
LivePolicies, the rule editor and shared ERP controls. Purchase Requests keeps request-only
policy defaults; the general buying-rules page can prepare either supported transaction.
The settings allowlist adds the PO approval settings path under configurationDraft only.
It does not enable operational orders, decide an approval or change runtime feature flags.

Core still owns identities, roles, branch scope and the approved company currency.
Procurement owns policy/grant configuration. Server allowedActions, current canonical people,
independent review, lifecycle versions and finite limits remain authoritative.

## Exact supported contracts

| Purchase use | Authority action | Permission | Amount basis | Supported policy reviewers |
|---|---|---|---|---|
| Purchase requests | PurchaseRequest.Approve | procurement-approval-decide | EstimatedLineBase | LineManager, ProcurementManager |
| Purchase orders | PurchaseOrder.Approve | procurement-po-approve | ApprovedLineBase | ProcurementManager |

Purchase use and reviewer descriptions are derived UI labels. No resourceKind or assigneeKind
field is invented on the grant API. A named financial limit is not an assignment to a task.
BudgetOwner remains unavailable until its authoritative assignment mapping is implemented.

Order limits cover quantity × unit price before discounts, tax and delivery. Finance's full
amount including tax is separately confirmed; limits are not relabeled as gross authority.
All limit and threshold values remain exact strings/canonical raw JSON decimal tokens.

## API composition

- Lists and people/scope lookups send explicit action; people are eligible for that action's
  current permission. List createAction/createAmountBasis must match the selected use before
  new draft controls are enabled, including during a type change/refetch.
- Create sends authorityReference, principalId, action and a bounded draft. Edit sends version
  and draft; it preserves the existing action/basis and does not add an unsupported action to
  EditInput. New-version drafts retain the original logical action/principal/reference.
- Unsupported action/permission/basis combinations remain visible and read-only. Responses
  must retain the expected tuple; an inconsistent saved response is unconfirmed, never an
  instruction to automatically retry or rewrite the configuration.
- Existing StrictMode liveness restoration, scope headers, abort handling, server action
  controls and authority interrupted-save reconciliation remain in place. No automatic create
  or lifecycle retry, inferred permission or default spending amount is introduced.

## Policy preservation

PO rules use the existing PurchaseOrder schema with ApprovedLineBase and One/All modes.
Changing a new unsaved draft's type preserves conditions and amounts; incompatible reviewer
choices become blank so the user explicitly chooses a supported reviewer. Existing saved
transaction types cannot be changed through the editor.

Unknown policy types, fields and unsupported PO reviewer assignments remain read-only.
Review/publish/return entry rechecks the saved definition instead of silently simplifying it.
No historical policy migration or field removal is performed. Existing policy APIs, validation,
server review controls and draft/publication workflow remain the owning backend contract.

## Authored verification and remaining gates

Six new unit cases cover PO schema/modes/threshold roundtrip, unknown policy keys, action-scoped
lookups/list metadata, create/edit transport, mismatched tuples and server-denied actions.
Six new mocked browser cases cover PO grant create/edit/default route, historical unsupported
limits, PO policy reviewer restriction/exact values, unsupported historical policies and
module-specific PO/PR editor defaults. Existing PR and uncertainty regressions are retained.

Focused unit verification (20 October 2026): the first run on host-default Node20.16 reported
16 passed / 1 failed. The new create/edit test reused a consumed Response body; its fetch
fixture now returns a fresh Response for each request. Rerun on Node22.23.3 with nice10 and
NODE_OPTIONS=--max-old-space-size=512 passed all 17 cases, including existing request rules,
exact amounts and interrupted-save behavior. No production implementation change was needed.

TypeScript `tsc --noEmit` also passed (exit 0) on Node22.23.3 with the same 512MB heap
and nice10 bound. Browser cases, staged build, actual backend integration and deployment
remain unverified in this increment.
Root owns those gates and integration of the independent operational-orders gate changes.
Mocked responses are not evidence of production persistence or successful PO approval/Finance
execution.
