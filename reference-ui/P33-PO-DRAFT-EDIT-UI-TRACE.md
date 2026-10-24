# P33 PO Draft Edit UI trace

This is the UI binding for the bounded unfunded internal Draft revision child feature in PROC-08. It reuses the imported purchase order editor sections and detail tabs. It does not enable amendments after funding, approval, issue, or receipt.

| UX step | Owning API and proof | UI guard |
| --- | --- | --- |
| Open Edit | `GET /api/procurement/v1/orders/{id}/principal-direct-draft` | Current scoped `procurement-po-read`; show Edit only when optional `principalOrderDraftRevision` and per-record `canEditDraft` are true. |
| Revise | `POST /api/procurement/v1/orders/{id}/principal-direct-edit` | Current `procurement-po-edit`; exact `expectedOrderVersion`, original source SHA, reason, line IDs and exact decimal body; no supplier, currency, unit, or source line switch. |
| Interrupted response | `GET /api/procurement/v1/orders/principal-direct-command-receipts/Edit/{key}` | Scoped session journal stores only operation, key and order ID. The browser never resends the POST automatically. |
| Review result | Saved detail `draftEditHistory` and current lines | History tab shows numbered revisions, reason and a truthful actor label. Immutable IDs, snapshot JSON and digests remain in the API/audit evidence rather than ordinary screen text. The original source binding and Create receipt remain separate. |

The optional capability defaults false on older metadata. The P33 backend currently has no registered positive revision readiness provider; the UI remains unavailable until genuine schema, finite role, and owner proof are accepted. A record can still deny Edit even when the module capability is on. The server repeats all source, supplier, authority, reservation and amount checks on every command.

The client permits a higher quantity when a lower unit price keeps line value and tax at or below the current draft. It does not invent an available source balance; the server checks the remaining approved request capacity and may reject the save with a conflict, leaving the current draft unchanged.

The existing Save and send control stays disabled because internal draft editing does not dispatch to a supplier or post Finance entries. Existing five editor sections, PO detail tabs, shared ERP controls, and all historical worker PO routes remain intact. Browser and unit tests are authored as source; their execution belongs to the serialized verification gate.
