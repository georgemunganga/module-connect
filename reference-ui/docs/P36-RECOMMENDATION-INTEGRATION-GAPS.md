# P36 recommendation draft UI integration gaps

Source audit only, against UI base `00ea9ff4008a79be80d11d578ed4472aeda6e0fc` and the held P36/P37 ERP source at `152f2b1e62cf3de52f161508a9e51a43d56d7725`. It does not enable a screen or establish runtime acceptance.

## Existing presentation

The imported RFQ detail uses `RfqDetailLayout` with Overview, Items, Related, Comments and History tabs. `PrincipalPublicationDetail` already uses Related for manual external contact and buyer-entered quotation Drafts. The ordinary and governed detail screens still identify evaluation and award as unavailable. Keep those screens and components; add purpose-specific recommendation content only after the server admits it. A named opened-offer reader may lack publication or ordinary RFQ read permission, so they also need an entry from the scoped opened-round worklist within the RFQ workspace. Do not route them through `PrincipalPublicationDetail` merely to obtain a title.

## Held API contract

The route group is `/api/procurement/v1/sourcing`. Commercial routes are mapped only when `ProcurementRfqCommercialOptions.Enabled` is true. Recommendation methods also require `OfferOpeningEnabled` and `RecommendationDraftEnabled`, concrete P36 readiness, the current `procurement-sourcing-recommend-draft` action, the independent `procurement-sourcing-opened-offer-read` action, a frozen named-reader policy, current branch and actor aliases, and the verified opened offer set. A generic sourcing or publication grant does not authorize this purpose.

| Purpose | Route | Contract visible in held source |
| --- | --- | --- |
| Find opened rounds | `GET /commercial-opened-rounds?offset=N&limit=N` | Reader-scoped `items`, `total`, `offset`, `limit`; IDs, branch and opened time only. |
| Inspect opened offers | `GET /commercial-rounds/{roundId}/opened-offers?offset=N&limit=N` | Verified offer set, at most 25 per page; supplier and offer IDs, currency and frozen line snapshots. Prices require the current read purpose and retained proof. |
| List my drafts | `GET /commercial-rounds/{roundId}/recommendation-drafts/own?offset=N&limit=N` | Only the current maker's drafts, at most 25 per page; draft/revision IDs and current snapshot SHA. |
| Read my draft | `GET /commercial-rounds/{roundId}/recommendation-drafts/{draftId}` | Current lines and revision history, scoped to the original maker. |
| Save a draft | `POST /commercial-rounds/{roundId}/recommendation-drafts` | `Idempotency-Key` UUID and `{draftId,expectedRevision,expectedSnapshotSha256,lines}`. Create uses null draft/SHA and revision 0; revise uses current draft, positive revision and exact 64-character SHA. Each line has `offerId`, `sourcingLineId`, `quantityExact` (up to 14,4), `proposedValueExact` (up to 30,8), and a trimmed 1–2000-character `rationale`. Saved acknowledgement is HTTP 201 with draft/revision/SHA and false award/PO effects. |
| Resolve uncertain save | `GET /commercial-rounds/{roundId}/recommendation-commands/{originalKey}` | Original-key receipt read under current purpose and source checks; return the saved acknowledgement. Never automatically repeat POST or create a replacement key after an unknown result. |

The domain permits an empty draft selection and multiple selected offers per sourcing line within the original authorized quantity and each frozen offered quantity. It does not calculate a winner or infer an evaluator's result. Exact quantities and proposed values must stay strings; no floating-point conversion or new total-cost formula belongs in the client.

## Required gates and missing presentation data

1. The backend `/meta` response has no distinct recommendation-draft capability today. Add a readiness-derived optional capability that defaults false in the client; do not infer readiness from `sourcing`, publication, offer-opening or the presence of a route. Keep current action and server scope checks on each request.
2. The opened-round worklist has no human RFQ title, number or method. Opened offers expose supplier IDs, but no verified supplier display name; the recommendation detail exposes source-line and offer IDs without human labels. The existing RFQ detail header and a selectable table therefore need purpose-safe title/number, source-line description/unit and supplier labels from a read authority that the named reader actually has. Do not show UUIDs as substitute human labels or fetch ordinary RFQ detail using an unrelated permission.
3. Keep authoring in the imported RFQ Related/History structure, with a scoped opened-round entry for reader-only users. Show each selected offer, source line, exact quantity/value, rationale and current revision; compare current source/offer evidence before editing and preserve entered values on a known 422. A 409 requires fresh GET and comparison. An ambiguous write keeps its original command key/body/CAS in bounded scoped recovery storage and offers GET-only reconciliation.
4. The held detail reports `assessmentCoverageComplete: null`, `canSubmit: false`, `awardCreatedByThisCommand: false` and `purchaseOrderCreatedByThisCommand: false`. Use **Recommendation draft** and **Draft** labels only. Do not surface approval, ranking, winning supplier, signed contract, supplier notice, award, PO or Finance effects. The opened-offer read similarly reports evaluation/award/PO unavailable.

The P36 schema and physical capture exist in held source, but enabling this UI still requires an accepted finite-role/runtime cohort and the distinct capability and label contract above. No new UI adapter is authored by this audit.
