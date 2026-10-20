# Procurement integrated UI browser verification

## Result and limits

**75 distinct mocked-API scenarios have passing checkpoints. This is an aggregate, not one uninterrupted green 75-test run.**

The production UI code is `5896c2f`; later commits only correct test locators/copy and record evidence. The first 14 PR cases ran on `613ae83` / `index-COjxy97z.js`. Their shared PR components, API adapter and tests have an empty source diff against the corrected candidate (`pr-checkpoint-source-diff.txt`). All other 61 cases have passing evidence on frozen `index-D-b3C2fm.js`. All original failure traces/screenshots/logs are retained. No timeouts were increased.

These tests mock Procurement business responses. They establish browser behavior and adapter contracts, not real backend authorization, persistence or financial correctness. Actual backend browser gates remain required. No production publish is included.

## Frozen artifacts

- JavaScript SHA256: `714a19b5a7c25ef03d9170af68121e6544250731826593a601ad93525f146e83`
- CSS SHA256: `ab6cd24631fa50705ab639e44682b9b51db798f587ef34c1641125cc3a3df3b7`
- HTML SHA256: `03628970c084f96aabf566a1a6d5ac260ecaaa6d3f9ad517a71c937573407f35`

Evidence directory: `/home/amizo/erp-backups/procurement-final-ui-20261020/`. Raw machine-readable manifest: `browser-75-checkpoint-manifest.json` in that directory. A later PASS supersedes an earlier failed attempt for the same scenario; failures remain available for review.

## Per-case passing provenance

| Suite / scenario | Test source | JS asset | Passing log | Duration |
|---|---|---|---|---|
| `live-approvals.spec.ts` — assigned approvals open scoped detail and require a reason for returns | `613ae83` | `COjxy97z` | `browser-first.log` | 27.8s |
| `live-approvals.spec.ts` — a lost decision response retries the exact key and payload once | `613ae83` | `COjxy97z` | `browser-first.log` | 21.1s |
| `live-approvals.spec.ts` — stale decisions refresh revisions before a new decision | `613ae83` | `COjxy97z` | `browser-first.log` | 19.5s |
| `live-approvals.spec.ts` — capability false keeps approvals closed and read denial makes no queue request | `613ae83` | `COjxy97z` | `browser-first.log` | 6.2s |
| `live-approvals.spec.ts` — queue empty state and read-only details never offer decisions | `613ae83` | `COjxy97z` | `browser-first.log` | 13.4s |
| `live-approvals.spec.ts` — requester starts approvals with the same key after an interrupted response | `613ae83` | `COjxy97z` | `browser-first.log` | 14.6s |
| `live-approvals.spec.ts` — missing approval-read permission denies the queue without loading records | `613ae83` | `COjxy97z` | `browser-first.log` | 9.1s |
| `live-approvals.spec.ts` — assigned queue paginates through bounded server pages | `613ae83` | `COjxy97z` | `browser-first.log` | 12.0s |
| `live-approvals.spec.ts` — navigation to a denied approval (403) removes old request actions | `613ae83` | `COjxy97z` | `browser-first.log` | 8.7s |
| `live-approvals.spec.ts` — navigation to a denied approval (404) removes old request actions | `613ae83` | `COjxy97z` | `browser-first.log` | 9.5s |
| `live-approvals.spec.ts` — returned requests stay locked while Finance release is pending even with an older Submitted header | `613ae83` | `COjxy97z` | `browser-first.log` | 13.2s |
| `live-approvals.spec.ts` — Finance records manual release evidence and recovers the exact interrupted confirmation | `613ae83` | `COjxy97z` | `browser-first.log` | 31.8s |
| `live-approvals.spec.ts` — a Finance blocker prevents approval while preserving permitted return actions | `613ae83` | `COjxy97z` | `browser-first.log` | 8.7s |
| `live-approvals.spec.ts` — a Procurement opener starts another request without assigned-queue access and recovers a lost response | `613ae83` | `COjxy97z` | `browser-first.log` | 17.4s |
| `live-authority-settings.spec.ts` — approval limit draft uses scoped named people and preserves the exact maximum decimal | `5896c2f` | `D-b3C2fm` | `browser-remaining-5896c2f.log` | 19.0s |
| `live-authority-settings.spec.ts` — an interrupted create cannot be automatically retried and reconciles the real saved draft | `5896c2f` | `D-b3C2fm` | `browser-remaining-5896c2f.log` | 23.6s |
| `live-authority-settings.spec.ts` — a read-only operator sees names and exact amounts without edit or activation controls | `5896c2f` | `D-b3C2fm` | `browser-remaining-5896c2f.log` | 10.8s |
| `live-authority-settings.spec.ts` — independent activation requires a reason and stale review clears the obsolete action | `5896c2f` | `D-b3C2fm` | `browser-remaining-5896c2f.log` | 15.9s |
| `live-authority-settings.spec.ts` — purchase order limits use the exact PO tuple and action-scoped people lookup | `5896c2f` | `D-b3C2fm` | `browser-remaining-5896c2f.log` | 22.9s |
| `live-authority-settings.spec.ts` — editing a PO limit preserves its basis instead of rewriting it as a request limit | `5896c2f` | `D-b3C2fm` | `browser-remaining-5896c2f.log` | 20.7s |
| `live-authority-settings.spec.ts` — an unknown historical authority basis remains visible and read-only | `5896c2f` | `D-b3C2fm` | `browser-remaining-5896c2f.log` | 10.0s |
| `live-configuration.spec.ts` — category and buying method drafts persist in Procurement settings | `5896c2f` | `D-b3C2fm` | `browser-remaining-5896c2f.log` | 29.2s |
| `live-configuration.spec.ts` — separate reviewer activates a category for buying | `5896c2f` | `D-b3C2fm` | `browser-remaining-5896c2f.log` | 16.1s |
| `live-configuration.spec.ts` — separate reviewer activates a buying method | `5896c2f` | `D-b3C2fm` | `browser-remaining-5896c2f.log` | 16.6s |
| `live-configuration.spec.ts` — configuration denial shows no browser-only records | `5896c2f` | `D-b3C2fm` | `browser-remaining-5896c2f.log` | 5.1s |
| `live-configuration.spec.ts` — stale configuration edit keeps entered fields | `5896c2f` | `D-b3C2fm` | `browser-remaining-5896c2f.log` | 8.7s |
| `live-configuration.spec.ts` — buying method preserves its explicit purchase route when only its name changes | `5896c2f` | `D-b3C2fm` | `browser-remaining-5896c2f.log` | 8.0s |
| `live-configuration.spec.ts` — unknown purchase route stays read only instead of being reset on edit | `5896c2f` | `D-b3C2fm` | `browser-remaining-5896c2f.log` | 7.2s |
| `live-configuration.spec.ts` — legacy API cannot falsely confirm a chosen purchase route | `5896c2f` | `D-b3C2fm` | `browser-remaining-5896c2f.log` | 8.3s |
| `live-order-approvals.spec.ts` — PO-only approver uses existing Approvals entry with actual order queue/detail contracts | `49b2545` | `D-b3C2fm` | `browser-po-policy-49b2545.log` | 28.1s |
| `live-order-approvals.spec.ts` — PO Reject requires a reason and never opens editing while funds are held | `49b2545` | `D-b3C2fm` | `browser-po-policy-49b2545.log` | 23.6s |
| `live-order-approvals.spec.ts` — PO Return requires a reason and never opens editing while funds are held | `49b2545` | `D-b3C2fm` | `browser-po-policy-49b2545.log` | 31.5s |
| `live-order-approvals.spec.ts` — stale PO decision removes old controls and does not reuse stale Core versions | `49b2545` | `D-b3C2fm` | `browser-po-policy-49b2545.log` | 21.6s |
| `live-order-approvals.spec.ts` — lost PO decision uses actor-owned receipt recovery without a second POST | `49b2545` | `D-b3C2fm` | `browser-po-policy-49b2545.log` | 25.4s |
| `live-order-approvals.spec.ts` — inactive PO assignment cannot expose an approval action | `49b2545` | `D-b3C2fm` | `browser-po-policy-49b2545.log` | 9.6s |
| `live-order-approvals.spec.ts` — missing PO assignment version fails closed instead of borrowing PR fields | `49b2545` | `D-b3C2fm` | `browser-po-policy-49b2545.log` | 8.5s |
| `live-order-approvals.spec.ts` — assigned PO queue paging preserves the order-specific route and scope | `49b2545` | `D-b3C2fm` | `browser-po-policy-49b2545.log` | 11.3s |
| `live-order-execution.spec.ts` — Finance-only operator discovers scoped orders and reviews exact amounts without general PO read | `49b2545` | `D-b3C2fm` | `browser-po-policy-49b2545.log` | 13.1s |
| `live-order-execution.spec.ts` — Finance interrupted write preserves exact payload/key and reconciles instead of posting twice | `49b2545` | `D-b3C2fm` | `browser-po-policy-49b2545.log` | 31.8s |
| `live-order-execution.spec.ts` — dispatch operator sees only its worklist and records issued revision via configured channel | `49b2545` | `D-b3C2fm` | `browser-po-policy-49b2545.log` | 50.3s |
| `live-order-execution.spec.ts` — stale command refreshes details and removes obsolete action candidates | `49b2545` | `D-b3C2fm` | `browser-po-policy-49b2545.log` | 43.6s |
| `live-order-execution.spec.ts` — detail navigation clears prior order actions when new ID returns 403 | `49b2545` | `D-b3C2fm` | `browser-po-policy-49b2545.log` | 14.6s |
| `live-order-execution.spec.ts` — detail navigation clears prior order actions when new ID returns 404 | `49b2545` | `D-b3C2fm` | `browser-po-policy-49b2545.log` | 6.3s |
| `live-order-execution.spec.ts` — blocked server hints cannot start a Finance action | `49b2545` | `D-b3C2fm` | `browser-po-policy-49b2545.log` | 3.8s |
| `live-order-execution.spec.ts` — execution capability false preserves legacy draft buying without probing execution APIs | `49b2545` | `D-b3C2fm` | `browser-po-policy-49b2545.log` | 4.0s |
| `live-order-execution.spec.ts` — unready order capabilities do not expose demo or live execution records | `a8251e6` | `D-b3C2fm` | `browser-final30-a8251e6.log` | 5.5s |
| `live-order-execution.spec.ts` — execution enabled blocks standalone legacy draft creation and edits | `a8251e6` | `D-b3C2fm` | `browser-final30-a8251e6.log` | 6.0s |
| `live-order-execution.spec.ts` — numeric money in execution detail is rejected instead of rounded for a financial action | `a8251e6` | `D-b3C2fm` | `browser-final30-a8251e6.log` | 4.0s |
| `live-order-execution.spec.ts` — buyer submit and issue use separate version-pinned keyed commands | `a8251e6` | `D-b3C2fm` | `browser-final30-a8251e6.log` | 10.5s |
| `live-order-execution.spec.ts` — FinanceRelease sends the held exact amount and restored reservation references | `a8251e6` | `D-b3C2fm` | `browser-final30-a8251e6.log` | 9.7s |
| `live-order-execution.spec.ts` — DraftFinanceRelease sends the held exact amount and restored reservation references | `e62a31c` | `D-b3C2fm` | `browser-final25-e62a31c.log` | 37.8s |
| `live-order-sources.spec.ts` — create one linked order with a partial exact quantity and pinned approved request version | `e62a31c` | `D-b3C2fm` | `browser-final25-e62a31c.log` | 19.5s |
| `live-order-sources.spec.ts` — multiple selected sources retain one-to-one draft line indexes and cannot add an unlinked line | `e62a31c` | `D-b3C2fm` | `browser-final25-e62a31c.log` | 20.8s |
| `live-order-sources.spec.ts` — mixed-branch source cannot be selected into the existing group | `e62a31c` | `D-b3C2fm` | `browser-final25-e62a31c.log` | 6.6s |
| `live-order-sources.spec.ts` — known conversion 409 preserves entered fields and never repeats the POST | `e62a31c` | `D-b3C2fm` | `browser-final25-e62a31c.log` | 9.5s |
| `live-order-sources.spec.ts` — known conversion 403 preserves entered fields and never repeats the POST | `e62a31c` | `D-b3C2fm` | `browser-final25-e62a31c.log` | 8.1s |
| `live-order-sources.spec.ts` — unconfirmed conversion recovers its unknown order ID by original key without a second POST | `e62a31c` | `D-b3C2fm` | `browser-final25-e62a31c.log` | 9.1s |
| `live-order-sources.spec.ts` — edit-only owner keeps all linked line IDs, unit/currency and metadata without requesting Convert permission | `e62a31c` | `D-b3C2fm` | `browser-final25-e62a31c.log` | 8.2s |
| `live-order-sources.spec.ts` — linked edit 409 requires review and never blindly retries | `e62a31c` | `D-b3C2fm` | `browser-final25-e62a31c.log` | 5.7s |
| `live-order-sources.spec.ts` — linked edit 403 requires review and never blindly retries | `e62a31c` | `D-b3C2fm` | `browser-final25-e62a31c.log` | 5.3s |
| `live-order-sources.spec.ts` — unconfirmed source edit preserves key/body and reconciles the recorded update | `e62a31c` | `D-b3C2fm` | `browser-final25-e62a31c.log` | 6.7s |
| `live-order.spec.ts` — buyer creates, revises and cancels an internal order draft | `e62a31c` | `D-b3C2fm` | `browser-final25-e62a31c.log` | 18.7s |
| `live-order.spec.ts` — read-only buyer cannot start or edit an order draft | `e62a31c` | `D-b3C2fm` | `browser-final25-e62a31c.log` | 6.8s |
| `live-policies.spec.ts` — buying rule draft checks and saves with company currency | `e62a31c` | `D-b3C2fm` | `browser-final25-e62a31c.log` | 11.4s |
| `live-policies.spec.ts` — approval step editor retains One and All decisions, custom codes and exact financial thresholds | `e62a31c` | `D-b3C2fm` | `browser-final25-e62a31c.log` | 10.6s |
| `live-policies.spec.ts` — invalid buying rule stays in the editor with a field issue | `e62a31c` | `D-b3C2fm` | `browser-final25-e62a31c.log` | 6.4s |
| `live-policies.spec.ts` — denied policy edits show an access message | `e62a31c` | `D-b3C2fm` | `browser-final25-e62a31c.log` | 8.2s |
| `live-policies.spec.ts` — a detailed policy draft cannot be simplified by the basic editor | `e62a31c` | `D-b3C2fm` | `browser-final25-e62a31c.log` | 5.1s |
| `live-policies.spec.ts` — draft author can send a checked rule for review without approval | `e62a31c` | `D-b3C2fm` | `browser-final25-e62a31c.log` | 9.3s |
| `live-policies.spec.ts` — sample preview explains controls without approving a purchase | `e62a31c` | `D-b3C2fm` | `browser-final25-e62a31c.log` | 9.9s |
| `live-policies.spec.ts` — reviewer can publish a future policy after review | `e62a31c` | `D-b3C2fm` | `browser-final25-e62a31c.log` | 9.0s |
| `live-policies.spec.ts` — reviewer can return rules for correction | `e62a31c` | `D-b3C2fm` | `browser-final25-e62a31c.log` | 11.8s |
| `live-policies.spec.ts` — PO policy setup requires procurement reviewers and preserves approved line basis | `e62a31c` | `D-b3C2fm` | `browser-final25-e62a31c.log` | 10.1s |
| `live-policies.spec.ts` — historical PO rules with request-only reviewers stay read-only and cannot be sent for review | `3e9460b` | `D-b3C2fm` | `browser-final2-3e9460b.log` | 12.4s |
| `live-policies.spec.ts` — PO module approval settings reuse the editor with PO defaults without changing request settings | `3e9460b` | `D-b3C2fm` | `browser-last1-3e9460b.log` | 24.7s |
