# Retained manual payment review

Frontend integration for [ERP issue 155](https://github.com/georgemunganga/erp/issues/155), after [ERP PR 156](https://github.com/georgemunganga/erp/pull/156) merged as `445699aa00ffc37c5099854c7cb22f6502210c9d`. UI base is `b91a5db3fa6d88ef7a373dce91acabe88d6852f6`.

Payments Made keeps its imported directory, detail tabs, history, editor sections and shared ERP controls. Saved payment requests and original-command receipts remain reviewable while new manual payment work is unavailable. Manual confirmation continues to describe externally reported payments; Finance owns bank execution and posting.

| Surface | Admission | Existing scoped HTTP / effect |
| --- | --- | --- |
| List | Literal `meta.capabilities.manualPaymentRead === true` and current `procurement-payment-read` | `GET /api/procurement/v1/manual-payments` |
| Detail and History | Same read admission | `GET /api/procurement/v1/manual-payments/{id}`; retained transitions and Core decisions |
| Original-command recovery | Same read admission and existing actor/company/branch/tab-bound journal | `GET /manual-payments/commands/{key}` or `GET /manual-payments/{id}/commands/{key}`; create recovery also reads current detail |
| New / Edit | Read admission, full `manualPaymentWorkflow` and current create/edit permission; saved draft ownership checks remain | Writer component and invoice/branch/assignee lookups mount only with write admission |
| Save / transitions | Full workflow and applicable current write permission, existing state/version/actor checks and journal restrictions | Existing owning command endpoints, server validation/audit; no adapter or command payload changes |

Missing, false or non-boolean read capability stays closed, including when the write capability is true. Both capabilities and current permissions participate in payment refresh/remount keys. Company All retains the existing scoped headers; write forms still require an explicit transaction branch. No employee projection is required.

If write capability or write permission disappears after an uncertain save, the original new/edit URL shows only the write-unavailable explanation, Back to payments and any existing recovery notice. It does not mount writer lookups. Recovery checks the original key with GET and never repeats the write. Without current READ permission, even recovery is denied. Empty, loading, error and retry states retain the existing shared presentation.

Implementation touches `src/lib/procurement-live.ts`, `src/lib/ProcurementLiveGate.tsx` and `src/features/LivePayments.tsx`. The API adapter, receipt journal, policy mutations and other workflows are unchanged.

## Verification

Product and initial test source: `ed044333bb8f5e264286b4de601a74680dca0f41`. Node `v22.23.3`; existing shared dependency symlink; no package installation.

- `npm run check`: passed.
- `VITE_PROCUREMENT_LIVE_MODE=1 npm run build:staged`: passed; existing large-chunk advisory.
- Eight affected Vitest files, one worker: 172 passed, including payment API, command/journal, presentation, policy editor, readiness, scope and organisation context.
- `playwright test --config playwright.payment-read.config.ts`: 31 passed (1.3 minutes), one worker, no retries; all existing 13 payment and three policy cases plus 15 new read/write separation and state cases.
- Frozen five-file SHA256/size manifest: [PAYMENT_RETAINED_READ_BUILD_20261103.json](PAYMENT_RETAINED_READ_BUILD_20261103.json). Test-only followup: `bf3032eedf81d39099d52debe26786b865b3090c`; product files match the frozen product commit exactly.

Browser configuration: `playwright.payment-read.config.ts`, one Chromium worker, no retries. Tests cover the existing payment and policy journeys plus read-only list/detail/history/reload in Company All, zero writer lookups or commands on denied new/edit URLs, invalid/missing capability, current READ denial, and real UI lost-response recovery after write flag/permission revocation using mocked HTTP. Browser screenshots document the retained presentation. These are frontend adapter/presentation regressions; Root owns real Core-cookie API acceptance and the paired production release. No hosted CI success is claimed.

Fresh build manifest identifies all five files and their SHA256/size, including `assets/index-DCNZtKnx.js` and `assets/index-DB7R84CS.css`. The immutable staged output is kept outside Git for Root acceptance; private native credentials, IDs and evidence are never committed.
