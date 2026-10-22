# Policy key dispatch safety

Source-only correction based on governed UI `2eee59b`, paired with canonical backend `0287ab9`. No policy, permission, feature flag, master, persistence schema or workflow is created.

The existing PR/PO editor handles only exact `PURCHASE_REQUEST` and `PURCHASE_ORDER` keys. Other keys keep their owning names and saved version history: SOURCING, RECEIVING, INVOICE_MATCHING and future INVOICE_UNIT_REVIEW never fall through to the PR JSON parser, amount basis, preview, submit or publication forms. Unknown keys stay read only too. A separate scoped GET loads saved versions; raw definitions are escaped read-only text. Actual backend authorisation remains mandatory. Unused-draft retirement continues only through the existing server-owned `canRetireDraft`/version hint and command; it is not inferred from a Draft label.

The links lead to existing module settings locations, which currently explain missing editor availability; no typed editor readiness is implied. The reviewed owned lifecycle/worker-evidence contracts remain in the ERP's existing Procurement child specifications. A later editor port must preserve exact schema/current readiness/independence rather than reuse these PR/PO controls.

Authored acceptance: 11 pure unit cases and three mocked browser cases cover exact key dispatch/labels/settings destinations, advanced drafts/review stages with no generic actions while PR/PO retain them, a detail key carrying misleading PR JSON, read-only saved-version GET without writes, and retirement only with the real server hint. These are UI contract mocks, not database/authority proof. No Node, build, browser or runtime job was run for this source increment.

Potential next-source provenance, not imported here: `/home/amizo/procurement-sourcing-policy-ui` contains `LiveApprovalSettings.tsx` (last source change `5896c2f`) and owned SOURCING policy lookup/editor work (`LivePolicies.tsx`, last source change `8226f82`). They require their complete exact typed clients and backend readiness contracts and must be reviewed as a separate bounded port. Receiving/matching editors must not be invented from PR rules.
