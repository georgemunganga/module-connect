# P37 Goods Return Draft UI addendum

This addendum applies to the 28-section `docs/procurement/PROC-09-P37-GOODS-RETURN-DRAFT-INTAKE.md` contract in the ERP repository. It covers only the restored Procurement workspace presentation and typed client. It does not make the P37 backend available or prove a real HTTP or database cohort.

1. **Scope:** Goods return intake is a draft proposal attached to one verified accepted goods fact.
2. **Owner:** The original accepted fact, receipt, PO line, issued version, and commercial pins remain Procurement owned.
3. **Route:** The contextual tab is `/procurement/workspace/purchase-receives/returns`; new, detail and edit are its child routes.
4. **Navigation:** The existing Purchase Receives page retains its header, receiving tabs, table, detail and editor. Returns is an adjacent contextual tab, with no new sidebar parent.
5. **Capability:** `principalGoodsReturnDrafts` is optional, defaults false when absent, and is independent of `principalReceiving`.
6. **Scope selection:** A selected company and explicit permitted branch are required; Organisation All cannot enter this workflow.
7. **Read permission:** List and detail need `procurement-return-read` and the server's own branch and purpose checks.
8. **Create permission:** The eligible accepted goods picker and create need `procurement-return-create`.
9. **Edit permission:** Edit and cancel need `procurement-return-edit`, current branch, original creator and server `allowedActions` on a fresh Draft detail.
10. **List:** GET `/api/procurement/v1/returns/principal-drafts?offset=N` renders the bounded 25-item page and `nextOffset`/`hasMore`; no total, search or sort is invented.
11. **Source picker:** GET `/eligible-goods?offset=N` renders verified accepted goods and retained labels; selecting an item does not reserve or return quantity.
12. **Detail:** GET `/:id` shows current proposal, labels and allowed actions. The source PO link requires existing PO read permission.
13. **Labels:** Only retained PO number, supplier display name, line number, goods description, unit, currency, delivery note and received instant appear as human context. Machine IDs remain in transport.
14. **Amounts:** Quantity is an exact string with at most 14 integral and four fractional digits; browser logic compares integer scaled units without `Number` conversion.
15. **Capacity:** Proposed quantity must be positive and no greater than the selected accepted fact. The server rechecks complete source and history on every command.
16. **Reason:** Create/revise/cancel require a trimmed nonempty reason of at most 2000 characters. Evidence reference is optional and at most 300.
17. **Create:** POST the selected `acceptanceFactId`, exact quantity, reason and reference with a new GUID `Idempotency-Key`.
18. **Revise:** PUT `/:id` with the GET detail's `expectedRevision`, exact quantity, reason and reference and a new GUID command key.
19. **Cancel:** POST `/:id/cancel` with current expected revision and reason, and a new GUID command key. The proposal is cancelled; the accepted goods fact stays immutable.
20. **Acknowledgements:** POST/PUT/cancel and command recovery return immutable saved acknowledgements without labels or allowed actions. The UI GETs current detail before showing actions.
21. **Uncertain writes:** Before each write, a bounded typed journal stores the exact command key, body and CAS in tab-local `sessionStorage`. A hard reload can check GET `/commands/:key`; the UI never automatically repeats POST/PUT.
22. **Scope invalidation:** Tenant, company, principal, branch and record bind each journal entry. Corrupt, stale or wrong-scope storage blocks new writes; a changed branch blocks save and recovery until reopening.
23. **Denials:** A missing/revoked action or wrong branch hides mutation controls; the server remains authoritative on every request.
24. **History:** The view identifies the current retained revision. It does not invent a timeline endpoint or aggregate return capacity.
25. **Effects:** The screen says Draft only. It never claims stock movement, Finance entry, supplier contact, credit, refund, dispatch, approval or return reservation.
26. **Presentation:** It reuses the imported Purchase Receives header/tab/table/detail patterns and the existing `TransactionEditorFrame` and ERP controls.
27. **Tests:** Authored parser, exact decimal, scope and command-recovery unit negatives plus mocked Playwright navigation, lost-response and revocation cases are separate from real HTTP proof.
28. **Release gate:** Backend P37 model, migration, readiness, finite grants, route registration, real private HTTP and independent owner checks are required before enabling the capability. This UI source checkpoint is unrun and default closed.
