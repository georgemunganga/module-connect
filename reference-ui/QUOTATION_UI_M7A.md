# M7A supplier quotation draft UI

The existing RFQ workspace now opens assigned quotation work at `/rfqs?source=quotations`, with the existing ERP shell, list toolbar, filters, selection, preview, shared controls and RFQ detail tabs. Published RFQ details link to the same quotation work when the current principal has explicit quotation READ.

The UI starts from Procurement UI main `c692611da5ca549ee00b1356cf7bc1e213b096da`. New offer capture uses the additive verified `source.lines` projection authored in ERP `1072f72ef48e3f85564df3e58d4944338c18bc85`. Until those lines are returned, creation remains unavailable; the UI does not call a maker-only endpoint or ask a handler to supply source UUIDs.

## Server ownership and actions

All endpoints below use `/api/procurement/v1/sourcing`, normal ERP cookies and the current company/branch headers. Quotation READ and module access are required. Employee links, original RFQ ownership and role names do not authorize these actions.

| UI action | Owning API | Owned state / validation |
| --- | --- | --- |
| Find assigned work | `GET /quotation-sources` | Current scoped retained RFQ sources; first 100 explicitly bounded |
| Read supplier invitations and drafts | `GET /{eventId}/quotation-drafts` | Server supplier/source labels, versions and `allowedActions`; verified source lines |
| Record outside contact | `POST /{eventId}/invitations/{invitationId}/manual-contact` | Invitation moves to `ManualContactRecorded`; original event/invitation CAS, documented channel/reference/time; explicit contact action |
| Create supplier draft | `POST /{eventId}/invitations/{invitationId}/quotation-drafts` | Buyer-entered Draft; full offer and active line set; current source/invitation versions and capture action |
| Revise supplier draft | `POST /{eventId}/quotation-drafts/{bidId}/revise` | Full retained offer and active lines replace the current draft with a reason and bid/source/invitation CAS; removed lines remain in earlier versions |
| Cancel supplier draft | `POST /{eventId}/quotation-drafts/{bidId}/cancel` | Cancellation-only reason and bid CAS; retained terms/documents stay on the server; no recreation is offered |
| Read current quotation/history | `GET /{eventId}/quotation-drafts/{bidId}` | Exact snapshot and ERP totals; bounded summaries show count, total and older-history warning |
| Read older version | `GET /{eventId}/quotation-drafts/{bidId}/versions/{version}` | One exact retained version; no false claim that the displayed summaries are complete |
| Resolve interrupted save | `GET /quotation-commands/{key}` | Original actor/key only; no repeated POST and no new command on unavailable/404 recovery |

The backend owns commercial eligibility, immutable version/contact evidence, command receipts, transactional audit/outbox effects and all monetary calculations. UI checks do not replace those controls. New writes require the selected source branch and the server's offered action. Company All remains a read context. Capture disabled does not hide history/recovery or authorized retained cancellation.

## Exact values and recovery

Offer reference/date, validity, offered payment code/text, warranty, delivery terms/date and receipt time are retained. Every line retains exact quantity, unit price, discount kind/value, quoted tax treatment/amount, delivery amount, offered tax code, lead time and notes. Raw four-place decimal strings use the existing exact validator. Server totals and G29-derived source estimates remain strings; no authoritative money is calculated with JavaScript Number. Numeric snapshot validity is translated explicitly to the documented write enum.

A scoped session journal stores only the original key, action, source and target locator. It stores no request body or supplier offer. Durable reference storage succeeds before POST. The original key remains frozen after ambiguous responses and across reload/navigation. Recovery failures preserve that reference. Confirmed validation/permission rejections permit correction; stale CAS preserves the edits and requires review/reload. Context changes remount the workspace and abort outstanding reads/writes while preserving the original scoped reference.

Empty document sets work. Retained document evidence stays visible; revision of attached drafts is unavailable until actual Core document-use transport exists. Cancellation sends no replacement offer or fabricated pins. Formal supplier submission, sealed opening, evaluation, award, PO conversion and Finance execution remain visibly unavailable.

## Verification boundary

Verification uses synthetic mocked HTTP fixtures. It does not establish database persistence, native authorization, actual transactional audit effects or production activation. Root owns the actual cookie/API/native-owner journey, backend publication, review/merge and deployment. No production flag, schema, role or deployment was changed by this UI work.

Run focused checks with Node 22.23.3:

```sh
npm run check
./node_modules/.bin/vitest run tests/quotation-draft-contract.test.ts tests/rfq-command-journal.test.ts tests/rfq-execution-contract.test.ts tests/rfq-publication-review-contract.test.ts --maxWorkers=1
VITE_PROCUREMENT_LIVE_MODE=1 npm run build:staged
./node_modules/.bin/playwright test --config playwright.quotation.config.ts
```

The browser configuration uses one worker and the staged production bundle. It includes the existing 22 RFQ cases and 19 quotation cases, with desktop and 390px mobile screenshots. The initial full 39-case run passed before the followup; the followup passed all 19 quotation cases, including failed-detail retry and retrying the same unavailable historical version. Focused adapter/journal checks passed 65 cases (37 quotation and 28 RFQ). Earlier failed reports/traces are retained separately in `/home/amizo/quotation-ui-m7a-evidence-20261103/first-browser-pass`: two test-locator failures and the corrected explicit-READ permission-state wording gap. The existing large-bundle Vite warning remains. Hosted CI success and whole-module UAT completion are not claimed.

## Prepared native journeys

[The native journey instructions](tests/normal-cookie/M7A-NATIVE-QUOTATION-PREPARED.md) describe the retained read/history and fresh B-contact/create → C-revise/cancel tests. Their protected-input configurations and sources are prepared for Root's reviewed private TLS proxy. Native browser execution remains held until Root admits the exact runtime, fixture and UI build; source preparation and static checks are not native acceptance.
