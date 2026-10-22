# Vendor-credit draft UI contract

Source implementation only, not yet built or browser/API verified. This adapter reuses the imported vendor-credit page arrangement and shared ERP controls, StandardDataTable, ListTools, filter chips and detail tabs. It never mounts browser-local credit operations in live mode.

- Gate: explicit backend `meta.capabilities.vendorCreditDraft === true`; absent or unknown remains false. Detail editing/cancellation requires `creditCrudVersion:1`, current allowedActions, invoice-read/capture and a worker account. The server remains authoritative.
- Source: actual invoice list/detail. Supplier, currency and branch come from the bill; the credit payload cannot override them. Source invoice is fixed after creation.
- Create `{supplierInvoiceId,creditNumber,amount,reason}`; update `{version,draft:{creditNumber,amount,reason},reason}`; cancel `{version,reason}`. Exact amount strings are preserved without Number conversion.
- List: backend search/status filtering precedes count/page. Columns, widths, selection and clipping reuse existing list controls. Sorting and CSV exports explicitly cover the loaded page; full export and import remain unavailable. CSV fields are escaped using the existing shared export helper.
- Recovery: stale edits retain inputs and require explicit reload; unknown mutation responses block another write and link to invoice-filtered saved credits. No automatic POST retry or invented idempotency key.
- Scope: list/editor/detail reset on tenant/company/branch/worker/record changes. Reads abort; old success/error/mutation callbacks are ignored after unmount.
- Historical exact amounts accept signed/zero model-valid18,4 strings without Number conversion; new writes and their expected responses remain strictly positive. Amount sorting uses signed integer units and never implies a Finance balance.
- Retained nonblank bounded historical statuses (including Received) remain readable in list/detail. Only exact Draft state can advertise draft editing/cancellation; new mutation responses still require their exact expected Draft/Cancelled state.
- Draft cancellation retains history. This slice does not apply credit to bills, alter Finance balances, post accounting entries, refund money, or provide bank/payment workflows. Unsupported actions and unavailable history/comments are labelled explicitly.

Backend owning specification: `PROC-10-CREDIT-DRAFT-CRUD-IMPLEMENTATION.md` in the ERP repository. Its aggregate registered-draft ceiling is against captured invoice gross, not an external available/payable balance.

Authored verification: exact-input/transport/action/capability unit cases and mocked HTTP create/edit/cancel/refresh, stale, uncertain-create, denied and missing-capability browser cases. Actual persistence and audit acceptance require a separate real API browser/owning-store gate; none is claimed by mocks.
