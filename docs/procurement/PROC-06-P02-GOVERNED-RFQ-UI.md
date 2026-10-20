# PROC-06 P02 — Existing sourcing UI adapter

Source-only candidate, based on invoice UI0420489. Backend contract: RFQ discovery e0818e1/6f031fd plus eligible branchRef12c0447, governed draft adapter bb1e987. Not built, tested, enabled or deployed. Tracking module-connect#5; release hold#29 applies. Earlier exact invoice verification does not certify this new candidate.

## 1. Feature Identification

Governed RFQ draft adapter within existing LiveSourcing list/new/detail routes.

## 2. Purpose & Business Outcome

Prepare internal quote requests from approved demand, including partial quantities and multiple PRs, without losing ad hoc drafting.

## 3. Scope & Exclusions

Own draft list/detail, approved-demand picker, explicit Create/Cancel and original receipt recovery. No publication, supplier dispatch/invitation, bidding, evaluation, award, PO conversion, payable or payment authority.

## 4. Parent & Related Features

Same existing sourcing child feature and routes. Backend 28-section discovery/governed adapter is authoritative; this document maps the screen/client boundary.

## 5. Actors & Participants

Current Core convert or cancel grant for governed discovery/detail. Create requires convert; cancel requires cancel. Capability alone never substitutes for an action permission.

## 6. Entry Points & Triggers

Existing `/rfqs` list has approved-request/ad-hoc choices when governed capability+action permit. Governed URLs use `?source=approved`; `/rfqs/new?source=approved` creates; `/rfqs/{id}?source=approved` reads/cancels. No new route page/menu.

## 7. Preconditions

Optional `sourcingSourceDrafts` resolves true only for an explicit boolean true. Missing/string/false resolves false; legacy `sourcingDraft` unchanged. Existing live gate and verified Core scope remain; server execution readiness/default-Unavailable unchanged.

## 8. Workflow

Open approved-request list → new draft → GET approved source candidates → add one or more lines → adjust exact quantities → explicit Create → actual owned detail. Cancel requires reason/CAS; quantities are released only after server command succeeds. Reads never reserve quantities. Unknown save result retains original operation/key and offers GET receipt recovery only.

## 9. Status / State Transitions

Server Draft/Cancelled and Reserved/Released only. UI Available/FullyAllocated/Unavailable are preview facts. Loading, empty, validation, denied, unavailable and ambiguous-save states are explicit; no optimistic terminal transition.

## 10. Permissions & Data Scope

Server enforces current canonical principal/tenant/company/selected branch. UI checks exact convert/cancel actions, remounts whole sourcing subtree on reactive tenant/entity/branch/worker/permissions/capability changes, and discards old selected/detail state. Branch membership and department selections are never inferred as grants.

## 11. Business Rules

Client checks exact common branchRef and currency (including explicit null branch, never guessed from shell), duplicate lines, per-request consistent CAS, 200-line bound and exact remaining quantity. Create revalidates current source/catalog/Finance/policy/complete allocation ledger. Client does not copy the backend allocation reducer or invent monetary thresholds.

## 12. Data Fields & Ownership

Governed original quantities/approved unit estimates/estimated values are exact strings; input validation reuses existing BigInt decimal helper. No Number/toFixed financial coercion. Request/event/method CAS must be safe integer numbers; unsafe values fail closed. Eligible branchRef key is mandatory; failed-proof rows omit it and expose no money/private owner properties. Legacy ad hoc transport unchanged in this slice.

## 13. Screens & Data Views

Existing LiveSourcing wrappers retain ad hoc list/editor/detail. Add governed list, picker and detail as feature components using existing shared controls, table, panels and shell. Governed drafts deliberately have no edit/publication button.

## 14. User Experience / Human Behaviour

Plain labels: From approved requests, Ad hoc drafts, Add line, Available, Needs review, Create internal draft. Explain that source candidate count includes blocked/assigned lines. Refresh source previews clears selections; changing pages/search preserves deliberate multi-PR selection until source refresh or context change.

## 15. Notifications & Communications

No client-side vendor messages or notification effects. No success before validated server result.

## 16. Documents & Attachments

No document input or raw evidence display in this bounded flow. Existing unrelated screens remain unchanged.

## 17. Exceptions & Edge Cases

Mixed branch/currency, duplicate sources, over-quantity, >4-place quantity, stale/unsafe CAS, malformed DTO, missing grouping branch and unexpected publication flags fail closed. Known request validation error may return to editing; ambiguous responses retain key and freeze mutation surface. Auth/object denials clear loaded governed detail/source state.

## 18. Integrations / APIs / Events / Sandbox

Typed purpose GETs `/sourcing/approved-sources`, `/source-drafts`, `/{id}/source-draft`; POST `/from-approved-sources` and `/{id}/source-cancel`; GET `/command-receipts/{Create|Cancel}/{key}`. Scope headers captured before fetch; UUID Idempotency-Key retained. Receipt recovery validates exact operation/key/original target/status/fingerprint/version and returns recorded history, not current commercial eligibility.

## 19. Audit / Security / Privacy

Server owns durable audit/outbox/receipts. Client responses are shaped to known fields; failed proof discards private/money fields. No raw error body/evidence payload rendering or browser-local transaction claim. No new localStorage transaction persistence or credentials.

## 20. Reports / Dashboards / Metrics

CandidateTotal is not eligible count. Owned total is server-scoped before paging; no fabricated company-wide totals.

## 21. Configuration & Localization

Shared ERP typography/colors/components unchanged. Exact decimal display reuses existing string grouping helper; no locale Number conversion. Currency remains approved source currency, not editable free input in governed form.

## 22. Non-Functional Requirements

Bounded search/pages, cancellation of stale GETs and context remount. Abort/unmount does not undo server commands; old-context completion does not navigate a newer context. No duplicated data grids/design system.

## 23. Postconditions

Successful Create navigates to server-owned event; successful Cancel reloads authoritative detail. No implied supplier delivery or Finance balance change.

## 24. Failure & Recovery

Interrupted/invalid/unconfirmed command responses offer GET recovery under same original operation/key. No automatic POST retry/new key. Recovery may return recorded earlier version; UI then reloads current detail. Unresolved commands remain visibly unconfirmed; refresh/context change clears local surface and server authorization still applies.

## 25. Acceptance Criteria

Exact wide4dp quantities survive input/body/response; partial multi-PR drafts use one exact branch/currency; no hold before explicit Create; original lost-response key recovers via GET without duplicate POST; cancel reason/version/fingerprint required; legacy remains accessible with older API; scope switch clears old data; no publish/payment action becomes ready.

## 26. Test Scenarios

Authored, unrun: 10 typed-client cases (exact strings/search, grouping/CAS, failed-proof privacy, no transport before Create, mixed/duplicate sources, consolidation, GET recovery, retained history/no publication, cancel target/version binding, bounded input/invalid detail), one metadata case plus absent capability assertion; five mocked-browser cases (exact partial consolidation+cancel, lost Create recovery, absent capability+legacy preservation, reactive branch clearing, missing action denial). Browser mocks are not live Core/Finance/PG proof. Required next gates: bounded client/readiness tests, TSC/build, these five transport mock cases, existing relevant sourcing/invoice regressions, then actual finite-role RFQ server/migration/browser/owner verification after backend readiness is available. No tests executed by author.

## 27. Ownership / Dependencies

Frontend owns presentation/typed transport. Procurement owns draft/source/reservation invariants; Core owns identity/scope/cases; Finance remains external authority. Exact backend additive branchRef12c0447 is a required consumer contract. No new identity, approval, ledger or readiness provider.

## 28. Open Decisions / Assumptions

Backend governed RFQ schema readiness and actual PG verification remain pending; default-off capability means source-only UI cannot activate live workflow. Exact archive/reload recovery UX for commands after a full browser reload remains outside this in-memory adapter; server receipt persists and no auto retry occurs. Award-to-PO transfer and source amendments are separate contracts. No production release claim.
