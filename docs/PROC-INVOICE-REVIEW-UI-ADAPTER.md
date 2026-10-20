# Bills review and Finance readiness — UI adapter addendum

Status: source candidate only. Based on receiving UI `63a9435` and reviewed backend readiness `df3df8b` / P26 history contract. No TypeScript, unit, build, browser, database or deployment job has run for this candidate. Existing verified assets are unchanged.

## 1. Feature identification

Procurement → Invoice validation → Recorded review and Finance readiness → View current invoice explanation. This is an additive view inside the existing Bills detail, not a new module/page.

## 2. Purpose and business outcome

Explain the next steps for this particular invoice and show its saved comparison results without implying invoice approval, an AP liability, a payment or a verified current Finance decision.

## 3. Scope and exclusions

Read-only readiness and own-invoice history. Capture, original documents and existing detail remain usable. No compare, mapping, approval, send, posting, payment, ledger or provider is introduced.

## 4. Parent and related features

Reuse LiveInvoices detail, Core shell selection, existing invoice intake/documents and P26 safe history. This does not replace their owning contracts.

## 5. Actors and participants

Existing invoice readers. Readiness uses the exact existing server invoice-read actor contract; history may additionally deny under its current canonical identity/source checks. The UI grants neither capability nor scope.

## 6. Entry points and triggers

Open an existing live Bill. Fetch finance-readiness via GET. Fetch matching history only when optional metadata invoiceComparison is true; absent metadata remains false. Refresh reloads the original invoice and then its review at the returned version.

## 7. Preconditions

Valid selected company and invoice ID; original invoice loaded successfully. Version and own line IDs must match each response before rendering.

## 8. Workflow

Load original → request read projections → validate their contract → display explanation/history or explicit unavailable/error. Never execute comparison as a side effect of opening/refreshing a page.

## 9. Status and transitions

No business transition. Readiness remains Blocked with canPrepareHandoff=false. Historical Compared/Blocked results are labeled saved history, not current approval. Schema unavailable, no recorded comparison and unknown counts remain distinct.

## 10. Permissions and data scope

Use shared company/branch headers and credentials. Backend remains authoritative. A401/403/404 or version409 from either review request clears both review projections. Navigation/unmount aborts old requests; late callbacks cannot restore prior record state. No broad PO or receipt lookup is used.

## 11. Business rules

Require explicit unavailable invoice-validation authority and Finance-receiver blockers for this bounded contract. Reject an unexpected Ready/canPrepare=true response rather than silently enabling a financial action. A missing capability never enables a command.

## 12. Data fields and ownership

Invoice owns original/version/line identities. P26 owns saved mapping/comparison/exception facts. Finance owns future posting/payment. The client picks only safe line summaries and explanations: it discards raw mapping snapshots, unrelated source allocations and private owner references. Quantities and money are invariant exact strings, never Number/parseFloat/toFixed roundtrips. Legacy capture fields are unchanged by this increment.

## 13. Screens and data views

Add Review and Finance, Recorded review history and latest-summary fallback panels to existing Bills detail. Use shared Panel, Badge, Button and RecordTable; retain document panel, original lines and Back navigation. There is no additional sidebar link.

## 14. User experience and human behaviour

Use plain wording: line links, review issues, not ready for Finance, refresh invoice. Display unknown as Not available yet, not zero. No pay/approve/post/compare/send button is invented. Saved results explicitly explain their historical meaning.

## 15. Notifications and communications

None emitted by GET. Existing notification ownership is unchanged.

## 16. Documents and attachments

Existing secure invoice document component remains separate. Review does not infer scan/hash/version authority from a display label or create/upload documents.

## 17. Exceptions and edge cases

Older backend404, unavailable schema/provider, malformed numeric output, foreign invoice line, stale version and denied history display actionable errors. The original invoice/document surface remains present where its own read succeeded. A403 does not downgrade into a broader lookup.

## 18. Integrations / APIs / events / sandbox

GET /api/procurement/v1/invoices/{id}/finance-readiness and optional GET .../{id}/matching only. No-store, abortable, no automatic retry; no command/event. Mocked contract/browser fixtures are synthetic and are not actual API authorization or database proof.

## 19. Audit / security / privacy

No new browser-side business audit or local record store. Ordinary UI does not retain raw source snapshots, other-invoice history, account data, private worker/owner references or unauthorised financial authority. Rendering exact values is presentation, not authorization.

## 20. Reports / dashboards / metrics

No analytics or aggregate exposure is inferred from current-invoice history. Open issue count is the server-owned nullable count only.

## 21. Configuration and localization

Reuse global fonts/branding/components. Capability absent=false. Show original invoice currency with server exact digits; no browser conversion, rounding or guessed currency scale. No configuration for nonexistent Finance owners.

## 22. Non-functional requirements

Abort requests on changed context/ID/version and reject mixed versions. GET has no body or writes and no retry loop. Use existing accessible table/panel/button semantics and loading/alert feedback.

## 23. Postconditions

User understands current recorded evidence and missing owners. Invoice, mappings, claims, receiving state, Finance references, outbox and payments are unchanged.

## 24. Failure and recovery

Refresh original invoice to obtain latest version before retrying reads. Lost GET responses create no uncertain business command. A future mutating adapter must retain command intent/key and use operation-specific recovery; this view does not acknowledge or retry a command.

## 25. Acceptance criteria

Only own-invoice summaries render. Exact long/eight-place strings survive. Missing comparison capability skips history. Missing schema/counts remain unknown. Current403/stale version clears history. Refresh produces only GETs. Original capture/documents remain intact and no financial action appears.

## 26. Test scenarios

Authored client tests cover scope headers, exact strings, private-field removal, wrong invoice/version, foreign lines, malformed/numeric money, missing-owner blockers, unavailable counts, denial/network/no-retry and historical-nonauthority flags. Four mocked Playwright scenarios cover explanation/no writes, exact saved history, denied readiness and stale readiness clearing history. All remain unexecuted until the coordinator grants serialized test/build/browser capacity; actual restricted API/browser verification is also required before release.

## 27. Ownership and dependencies

UI owns presentation only. Backend readiness/history and original invoice remain authoritative. Root coordinates source integration, TypeScript/unit/browser and real API gates. No feature/deployment completion claim is made by this source commit.

## 28. Open decisions and next implementation

Mutation UI awaits a reviewed invoice-purpose source selector rather than borrowing PO/receiving read permissions or asking users to type arbitrary IDs. Proposed owner contracts are GET .../{invoiceId}/matching/sources and per-order-line acceptances; until reviewed/merged/tested they are prerequisites only. Those results describe scoped issued lines/historical acceptance, never availability or allocation authority. Next mapping form must also bind immutable original document/version/hash and exact line units, independent reviewer identity, current invoice version and governed policy. Capture and compare permissions stay distinct; no automatic compare, claims or approval. Each command needs one stable intent/body/key, no automatic mutation retry and current-scope historical receipt recovery. Unknown historical Finance exposure must block a qualified comparison; the UI must never fabricate complete history or zero consumption.

## Next source increment — mapping and explicit comparison design

Pending selector review: backend candidate `76c3a7d` has two distinct findings under correction (retained-issued scope before count/page and unknown legacy acceptance history). Do not wire that candidate as available until its corrected source is reviewed. This design records the existing command contract, not completed UI.

1. Extend this same detail with a Line links editor only when invoiceComparison and invoice-read/capture/match are present. Capture grants mapping writes but does not grant the new match-purpose selectors; users lacking match retain original capture/document/read workflows and receive no broad-PO lookup fallback. Explicit Compare requires invoice-match; no auto-submit on GET, refresh, source selection or save.
2. Use paged purpose source rows, retaining invoiceVersion, policyVersionId, orderId, issuedVersionId and purchaseOrderLineId as a single pinned selection. All invoice lines must map to one order/issued version because the actual MappingInput supports one target; prevent accidental cross-order mixing. Unavailable source rows are visible explanations but not selectable. Reset dependent receipt choice on source/policy/version change.
3. For ThreeWay use named acceptance rows from that precise order/line and retain their goodsReceiptLineId XOR serviceAcceptanceId; facts are historical, not remaining invoice capacity. Unavailable/null count must not become empty verified history or zero. TwoWay carries no inferred receipt. No arbitrary source IDs or hidden broad module requests.
4. Each original invoice line needs exact entered unit code, a selected existing invoice DocumentVersionId and a document line reference. Reuse listInvoiceDocuments; selectable versions must have Available scan state and valid returned immutable hash. Selection is a user assertion only, never a Verified unit review. No synonyms, automatic UOM conversion or guessed document-line authority. P26 current independent reviewer/provider remains unavailable and Compare must report this honestly.
5. POST matching/mappings body is {version,purchaseOrderId,issuedVersionId,lines:[{invoiceLineId,purchaseOrderLineId,goodsReceiptLineId,serviceAcceptanceId,invoiceUnitCode,documentVersionId,documentLineReference}]}. It saves Unverified linkage, not approval. Current invoice original/version must match every selector response. Preserve original numeric capture compatibility; this new form does not rewrite amounts.
6. POST matching/compare body is {version,mappingVersionId,reason}. Resolve current mappingVersionId from readiness's current mapping pointer or a confirmed mapping command response, never max(history revision), row order or a saved stale local choice. Refresh current invoice/readiness before a deliberate Compare after a mapping save, as mapping save bumps the invoice version. A Blocked result is a valid persisted comparison outcome and must display issues rather than be described as network failure.
7. Generate one UUID idempotency key per deliberate action. Retain exact serialized body, operation InvoiceMapping/InvoiceCompare, invoice/target IDs, actor subject/worker and company/branch in browser-lifetime pending memory before sending. Do not automatically POST retry after network, malformed response or5xx. Pending unknown results disable further writes. GET matching/commands/{key}?operation=... reconciles the original actor-owned action under current access; its recorded result is historical and not current replay permission. On409/denial clear stale selectable facts, retain entered text where safe and require reviewed new intent; never silently change the stored key/body.
8. Validate command envelopes against original key/invoice/operation permission, commandSchemaVersion1, historical flags and canPostToFinance=false before showing success. Unexpected/malformed success is uncertain, not permission to start again. Recovery404 is not proof that a concurrent command never committed; keep uncertainty until deliberate checked recovery or a clearly new reviewed intent under the backend contract.
9. Required source tests: exact selector values and null history, malformed IDs/mixed invoice/version/policy, unavailable row cannot select, linked source resets acceptance, current mapping pointer vs historical list, Available document-version selection only, no compare on reads/save, operation-specific permission gates, POST no retry, stable lost-response key/body, recovery current actor/scope and historical flags, abort/context changes and no stale mutation callback. Browser cases must exercise existing detail only and prove no pay/post/send actions. Actual restricted backend/browser tests must establish resulting immutable mapping/comparison/receipt records and blocked provider outcomes before release.

## Context-clearing correction after source review

The existing live gate does not prove a synchronous child remount: it clears readiness in an effect after branch/entity changes. Bills detail now wraps the entire original invoice, documents and review in a keyed inner surface. Its key uses reactive Core shell selection plus server-verified readiness tenant/company/worker, permissions and capabilities, and route ID; it no longer relies on reading mutable storage headers to key only the review child. A context change therefore mounts an empty/loading original surface before effects, and unmounts all old document/review requests. A newly authored delayed replacement/branch-denial browser case asserts all three old surfaces disappear before the replacement invoice response is released. Verified worker changes likewise change the key; the current readiness contract exposes worker identity, not an account subject, so this increment does not claim a separate alias-account change detector. Sign-in/session ownership remains in the existing ERP shell; backend authorization is always current. No tests or jobs have run for this correction.
