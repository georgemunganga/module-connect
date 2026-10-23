# Imported Procurement UI restoration

23 October 2026. Keep the Greenwebb layouts and ERP shared components; complete backend adapters without replacing the product screens.

## Layout baseline

`d104f596183e7a012a04578a679aac795e1489d4` (Use shared ERP controls and shell in procurement) is the ERP-adapted reference, rather than the raw Greenwebb theme. Its RecordList, RecordDetail, TransactionEditor, PayablesInbox and shared controls remain available in the current source. Current navigation, branding, authorization, exact values and recovery fixes are preserved.

## Restored in this milestone

- Bills directory: original list toolbar, columns, field filters, sorting, selection, preview and pagination using shared ERP controls and actual API adapters. Current-page filters and exports are labelled accurately.
- Bill editor: vendor band, grouped fields, item table, totals, notes/terms areas, fixed action placement and discard confirmation. Existing server create/edit, optimistic version, exact decimal, account/scope and uncertain-response guards remain.
- Bill detail: original header/action placement and Overview/Items/Related/Comments/History sections. Existing document, comparison, original-unit review and cancellation logic remains. Pending document state survives tabs and refresh.
- Inbox: original upload-panel layout, shared controls and real received-invoice rows. Browser-local files or payment success are never manufactured.

## Verified

Code commit: `ff0c3483d293f82d9dc1f66b141778f2c6310dc4`.

- TypeScript and live production build passed.
- Two focused list-presentation unit cases passed.
- All23 Playwright cases passed against the staged production bundle, one worker, zero retries/skips/failures. Cases include edit/cancel/reload, permission denials, unknown writes, document upload recovery across tabs/parent refresh, original form sections, discard confirmation and desktop1440/phone390 layouts without page overflow.
- Source and built asset hashes remained unchanged across the final browser run.
- Private result: `/home/amizo/erp-backups/procurement-imported-ui-restoration-20261023_run06/result.json`; SHA256 `a6199da230ba9fd705cfa9a15707df60c39f3af1f796209a348a418a7069fb36`.

These browser cases use HTTP fixtures. They verify presentation and client behavior, not actual database persistence or production deployment. Earlier failed/interrupted attempts are retained separately, including the selector, dropdown-label and phone-overflow failures corrected before the final pass. Hosted CI success is not claimed.

## Still incomplete

Other module screens require their own original-layout parity review. Manual payment recording and batch operations need server workflows. Payment terms, notes/terms capture, pre-save files, Inbox upload/email/portal intake, related-record graphs, comments, detailed history and full-dataset list operations remain visibly unavailable where their contracts are missing. These are integration gaps to implement behind the retained UI, not reasons to remove the UI or fake local success. This milestone does not certify the whole Procurement module.
