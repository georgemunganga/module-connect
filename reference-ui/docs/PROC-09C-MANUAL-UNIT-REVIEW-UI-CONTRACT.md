# PROC-09C · Manual invoice unit review UI contract

This is an integration contract for proposed ERP backend source `a66419ad0c6f55a15344fc204818888d4fedd832` and module-connect UI source based on `e6b4c53d0c6ee4e6924fb09ba58c7d18876cf222`. Backend acceptance, release, and production activation remain separate.

## 1. Purpose

Let a maker request an independent check of manually entered invoice units for an issued principal purchase order. The check records evidence about units; it does not approve the invoice, claim matching capacity, or post to Finance.

## 2. Existing layout

Use the original bill detail, review settings, assigned approvals, and review detail components. Retain their headers, tables, dialogs, and navigation.

## 3. Evidence modes

Document review remains policy schema 1 with nullable legacy source-schema marker and terminal evidence schema 3. Manual attestation is policy schema 2 with `evidenceMode: "ManualAttestation"`, source schema 4, and terminal evidence schema 4. Never infer one mode from an empty document list.

## 4. Policy history

View saved policy versions in the existing settings list. A draft may be edited only after its exact schema is parsed; unknown fields and unsupported schemas remain read-only.

## 5. Policy creation

The editor offers an explicit mode for a new draft. Schema 2 serializes `schemaVersion`, `transactionType`, `evidenceMode`, and `stages`; schema 1 output stays byte-compatible with the existing editor.

## 6. Named reviewers

Reuse the Core-principal reviewer picker. A saved principal ID survives a search miss; current server eligibility is checked at policy submission and execution.

## 7. Policy lifecycle

Use existing validation, create, update, submit, publish, and return routes with distinct configuration actors. Preserve the existing pending-command guard and version checks.

## 8. Effective policy

Manual work requires a currently effective published schema 2 policy. A schema 1 policy does not authorize manual work, and a schema 2 policy does not authorize document review.

## 9. Comparison dependency

Manual review requires a current principal invoice mapping with source schema 3 and a currently published matching policy. It does not require Finance AP or bank posting.

## 10. Manual mapping identity

The mapping must keep both `documentVersionId` and `documentLineReference` empty. Do not create a fake document or reference to satisfy the document path.

## 11. Read capability

`invoiceManualUnitReviewRead` gates manual detail, task, and original-key reads when new work is disabled. Current actor permission and physical readiness still apply.

## 12. Write capability

`invoiceManualUnitReview` additionally requires the new-work switch, selected concrete branch, current permission, and physical write readiness. It is a UI availability hint, not proof of authority.

## 13. Matching capabilities

`principalInvoiceComparisonRead` remains historical read/recovery; `principalInvoiceComparison` is selected-branch new mapping and selectors. The manual review UI does not turn either matching bit on.

## 14. Legacy document capability

`invoiceOriginalUnitReview` continues to gate the existing original-document path. Its document download and attestation controls remain unchanged.

## 15. Selected branch

Company-wide task collection may read assigned rows. Detail, recovery, Open, and Decision use the record's concrete branch; an explicit All write is unavailable.

## 16. Maker readiness

`GET /api/procurement/v1/invoices/{id}/manual-unit-review-readiness` returns current invoice and mapping revisions, blockers, existing review ID, manual lines, and `canRequestReview`. Revalidate before Open.

## 17. Maker reason

Manual Open requires a nonempty trimmed reason of at most 2000 characters. The existing document Open reason remains optional.

## 18. Open command

`POST /api/procurement/v1/invoices/{id}/manual-unit-reviews` sends `{invoiceVersion,mappingRevision,reason}` with one durable `Idempotency-Key`. The browser records the scoped, nonsecret command locator before POST; the server retains the exact request fingerprint.

## 19. Assigned queue

`GET /api/procurement/v1/manual-invoice-unit-reviews/tasks` is purpose-only for the named review permission. It shows only current pending Core assignments and current mappings.

## 20. Review detail

`GET /api/procurement/v1/manual-invoice-unit-reviews/{id}` supplies original invoice line values, manually entered unit lines, maker reason, case and assignment versions, blockers, and current action candidates. It has no document download dependency.

## 21. Independent reviewer

Only the currently named, independent Core reviewer can decide. The UI uses the returned assignment ID and version; it cannot select a substitute employee.

## 22. Attestation

Approve sends exact `ManuallyEnteredUnitsConfirmed` after explicit user confirmation. Return and Reject require a reason. All manual decisions require a reason.

## 23. Decision command

`POST /api/procurement/v1/manual-invoice-unit-reviews/{id}/assignments/{assignmentId}/decisions` sends the current invoice, case, and assignment versions, action, reason, and optional attestation under one durable key. The browser records the scoped locator before POST.

## 24. Original-key recovery

Lost Open ACK uses `GET /api/procurement/v1/invoices/{invoiceId}/manual-unit-reviews/commands/{key}` to find the maker's own receipt without a review ID or current mapping. Decision uses `GET /api/procurement/v1/manual-invoice-unit-reviews/{reviewId}/commands/{key}?operation=Decision`. Reload never creates a new command key or repeats POST automatically.

## 25. Receipt verification

Validate exact invoice/review/case/key/operation, maker principal and schema-specific identity/evidence versions before clearing a pending marker. A missing receipt or unknown response leaves the command pending.

## 26. State changes

Current mapping, invoice digest, policy, issued order, actor scope, and Core assignment are rechecked by the server. Display blockers and refresh rather than treating a prior candidate as durable authority.

## 27. Error and empty states

Show separate unavailable, no-assignment, superseded-mapping, disabled-new-work, incomplete-review, and interrupted-command states. Keep saved history readable while new work is off.

## 28. Acceptance boundary

Focused adapter, policy, journal, and original-screen tests are required. Actual private normal-cookie UI, owner graph, logout, and flag-off recovery evidence are still pending; document-mode UI and production flags remain as published.
