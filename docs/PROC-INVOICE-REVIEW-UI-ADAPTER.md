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
