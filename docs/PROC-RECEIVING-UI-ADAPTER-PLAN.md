# Receiving UI adapter — bounded implementation plan

Status: source increment only; no TypeScript, unit, build, browser, database or deployment gate run. Frozen PO candidate `1a023ac` and its staged artifacts remain untouched.

## Reuse and contract

Use the existing Purchase Receives navigation and shell, simple PageHeader, RecordTable backed by the ERP standard table, Panel, Field, Input, floating Select, Switch and Modal. No separate identity/company/permissions service or new sidebar. Backend read/command contract is `ce12e64` plus legacy visibility `530bfcc` and service-note roundtrip `2d8b35f`.

The first source increment adds a typed scoped transport and five authored contract tests. It does not connect a route or enable receiving. DTOs follow actual server names; every quantity/money stays an invariant exact string. Goods physical delivery is not clipped to order availability. Input validation permits representable physical overdelivery; server rules govern inspection and acceptance.

## Smallest route composition

- Existing `/purchase-receives`: goods receipts and service confirmations tabs when receipt-view is granted; separate purpose-only inspection/service tasks tabs for their actual permissions. Use bounded server paging, explicit empty/denied/error/loading, no fabricated filters/import/export.
- `/purchase-receives/new`: source-first goods/service selection from `/receiving/sources`. Retain order/issued/line/site IDs. Goods draft has received and initial rejection quantities, received timestamp, delivery note and notes. Service draft has period/deliverable/intended quantity/notes, never an editable acceptance value.
- Existing detail: goods read, with purpose `inspection` choosing `/inspection-task`; service detail selects `/service-acceptances/{id}` or `/certification-task`. Query/purpose is a read-mode selection, not a permission grant. Named task-only users never probe the broad read endpoint first.
- Draft editing preserves all source bindings and quantities/notes via full detail. Service notes use the explicit normal-detail field added in `2d8b35f`; task-only detail omits notes. No arbitrary source replacement or post-record editing.

Use additive granular metadata `receivingDrafts`, `receivingGoods`, `receivingInspection`, `receivingServices`; absent flags resolve false. The legacy broad `receiving` flag never silently enables demonstration data in live mode. Capability alone never grants permission.

## Detail and actions

Show physical received, initial rejected, inspection rejected, accepted and held separately. Readiness capacity is shown only with `verified=true`; null/unknown is described as needing review, never zero. Effects remain immutable references, not a copied ledger. Source labels come from retained server evidence. The source picker currently has order number/description/UOM; do not invent a supplier label through unrelated broad lookup.

Only actual server candidate objects choose offered actions. Candidates are hints and every command is validated by the server. Record arrival is a header command: every active line must permit Record, then submit once for the entire header. Inspect and Accept use line version plus source version. Certify uses service version/source version and the existing intended quantity. Evidence is a structured reference, not an uploaded file. No stock, AP, payment, return/reversal or matching claim is implied. Core document bytes remain unavailable for receiving.

## Safe command lifecycle

Keep original UUID, exact body, operation, target/source and company/branch/canonical worker in browser-lifetime pending memory before a write. No automatic POST/PUT retry. Known validation errors preserve text; 409 requires refreshed evidence and a reviewed new intent. Unknown response blocks fresh writes and offers GET-only command receipt reconciliation, including unknown target ID for creation. Recovery response is historical evidence (`replayAuthorized=false`), not authority for another command. Context/ID/purpose navigation clears stale details and aborts/ignores old callbacks; pending outcomes remain separated by scope and actor.

## Required focused tests before activation

Authored client tests cover exact maximum/four-place boundaries, separate command paths, no retry after lost response, unknown-ID receipt recovery and malformed numeric output rejection. Further mocked browser coverage must exercise physical overdelivery with blocked acceptance, independent inspector/service-owner task access without receipt-view, unknown capacity/legacy rows, protected drafts, stale/denied ID navigation, exact strings, scope headers and lost-response recovery. Then a fresh restricted real backend/browser goods/service workflow must verify actual persisted effects/counters/history and replay. All runtime gates are pending.

## Second source increment — list/detail and positive actions

An unmounted reusable `LiveReceiving` adapter now implements the existing table/page primitives, permission-specific goods/service/task lists, scoped detail loading, separate physical/rejection/held/accepted values, server candidate actions, record/inspect/accept/certify/cancel dialogs and GET-only uncertain-outcome reconciliation. Scope/actor/purpose remounts clear stale record state; aborted callbacks cannot restore an older record. Command errors persist across the automatic authoritative refresh. Unknown outcomes retain their original key/body in actor+company+branch+target browser-lifetime memory.

Granular receiving capability parsing is additive and absent keys default false. No route imports, sidebar changes or live activation are included in this increment. Draft creation/edit forms and browser scenarios remain to be authored; all unit/TypeScript/build/browser gates remain pending. This is source backup, not a complete usable receiving UI or production claim.

## Third source increment — source-first draft forms

An unmounted draft editor now selects issued goods/service sources and preserves their order/issued/line/site pins. It supports multiple goods lines from one issued order, exact physical and initially rejected quantities without clipping overdelivery, one service line with period/deliverable/intended quantity, and scoped draft editing that retains current IDs and notes. Service editing requires the explicit normal-detail notes field. Site/vendor/price are not invented editable masters. The same pending-command memory supports detail actions and drafts; unknown create outcomes recover their target ID by original order/key, without another POST.

Route wiring and authored browser tests remain the next source increment. These forms and prior adapter components have not been typechecked, built or browser-tested. Do not merge/activate them as verified receiving behavior.

## Service contract alignment — 6b574d7 / b43e9b0

Source audit confirms certification already uses `record.sourceVersion` from a fresh scoped service-detail read, alongside the service record version. Draft-save replies are not used as certification authority. After another partial certificate, the backend detail now exposes the existing ledger state's current CAS even while this pending draft has no persisted source binding. The UI preserves that returned number; it never infers a zero source version from an unbound draft.

Normal service detail now separately exposes nullable `notes` and read-only `cancellationReason`; task-only detail omits both. The adapter displays those normal-detail narratives separately and edits only draft notes. Cancellation reason is never a draft input or a substitute for notes. The client checks the requested read purpose and rejects private narrative fields in a purpose-only response. Three additional authored contract tests cover current source-version changes, long-note/cancellation separation, and purpose-only endpoint/privacy behavior. These tests have not run; no Node, SDK, browser or database job was started for this alignment.
