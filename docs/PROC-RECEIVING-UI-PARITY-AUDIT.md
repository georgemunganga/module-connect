# Receiving UI parity audit and source correction

**Baseline inspected:** imported `RecordList`, `RecordDetail`, `TransactionEditor`, `LineEditor` and their shared presentation components at frontend `95a3f9e`.
**Finding:** The first live adapter reused ERP primitives but reduced the original list tools and detail/form arrangement. This audit records concrete differences and the source corrections.
**Verification:** Source inspection and authored tests only; no Node, TypeScript, build, browser, SDK or database job. No deployed assets or capability flags changed.

## Observed controls and disposition

| Original receiving surface / exact source | First adapter95 | Source correction / honest boundary |
|---|---|---|
| `RecordList.tsx` PageHeader, New button, shared shell | Retained shell/header; new action renamed Add delivery | Same existing Purchase Receives route/nav; capability+permission gated Add delivery retained |
| `RecordList.tsx:RecordList` `ListTools`, column selection, widths, clipping/reset | Missing | Reuse actual ListTools and StandardDataTable; columns/widths/clipping/reset work on the authorized returned page |
| `RecordList.tsx` selected rows, Export selected, Clear selection | Missing | Reuse shared selection and selection bar; export selection/all/view shows explicit unavailable reason, no local CSV presented as an ERP export |
| `RecordList.tsx` status/view filter and ActiveFilterChips | Missing | Reuse shared filter modal/chips; normal worklist passes exact supported state to API before server paging/count; assigned queues do not invent unsupported state filtering |
| `RecordList.tsx` search and sort controls | Missing | Search region remains visible with explanation; More→Sort remains with explicit unavailable notice. No misleading current-page-only search/sort presented as all ERP results |
| `RecordList.tsx` row quick-summary modal | Direct detail link only | Shared StandardDataTable row/keyboard opening now shows scoped summary modal; Review delivery navigates to the existing canonical detail route |
| Generic receiving import / print | Not present | Audit correction: generic RecordList does **not** pass ListTools.onImport, and generic receiving detail has no print/PDF action. No invented working import/print added; secure export remains explicitly unavailable |
| `RecordDetail.tsx` Overview, Items, Related, Comments, History tabs | Missing | Reuse actual DetailTabs; retain those sections and explicit Documents section; task-only views intentionally omit private comments/documents |
| `RecordDetail.tsx` overview/activity two-column arrangement | Flat panels | Restore overview main/activity column arrangement using shared DetailSection and ActivityTimeline. Timeline uses real recorded arrival/acceptance evidence, not fabricated creation/comment events |
| `RecordDetail.tsx` line details, account, rate, amount | Exact delivery/acceptance quantities retained, commercial fields absent | Keep exact line/acceptance details and point to Related source PO for rates/accounts when the actor has PO-read. Current receiving detail lacks a sealed price/account projection, so never invent zero or multiply client numbers to restore a cosmetic total |
| `RecordDetail.tsx` source / Related links, Create bill | Missing | Related source PO link only with appropriate permission; Create bill retains an explained unavailable control. No fake invoice/matching eligibility or broad PO-read grant |
| `RecordDetail.tsx` Comments / Add Comment | Missing | Restore comment sections and explained unavailable Add Comment; no browser-local saved comments represented as ERP records |
| `RecordDetail.tsx` attachment names / document region | Missing | Render scoped server document references with version/classification; Attach/Download explain missing receiving Core-owner adapter. No local filename masquerades as uploaded evidence |
| `RecordDetail.tsx` More→Delete | Missing | Explicit explained Delete delivery control; durable records are retained, permitted draft cancellation remains a real guarded command |
| `TransactionEditor.tsx` close and cancel/discard dialog | Direct cancel link lost form silently | Restore Close editor and discard confirmation; Keep editing retains fields; uncertain original command remains in scoped memory |
| `TransactionEditor.tsx` source/vendor/reference/title top region | Source table; other controls absent | Preserve source-first form and vendor/reference region. Vendor/source/coding are retained/read-only; server generates reference. Unsupported transaction title stays visibly unavailable with help, not a fabricated payload field |
| `LineEditor.tsx` receiving Items/Account/Received Qty/Unit | Exact custom table | Retain source items, account context, exact received/rejected quantities/UOM using shared RecordTable/Input. Generic LineEditor reads local item masters and uses numeric values, so it cannot safely hydrate live evidence unchanged |
| `TransactionEditor.tsx` notes and Attach Files | Notes only | Restore notes/attachment region with shared Field/Textarea and explained unavailable Attach files |
| `TransactionEditor.tsx` sticky Save as Draft / Record Receive / Cancel | Nonsticky save/cancel | Restore sticky footer; Save delivery draft is real. Record Receive/Confirm service explains save-first/current-evidence workflow; actual final actions remain on scoped detail with server hints, CAS and evidence |
| Generic overdelivery cap / local mutable status | Blocked quantities above source; local Record Receive | Deliberate business correction: capture actual physical overdelivery, control acceptance separately. Never preserve an incorrect local cap or local status mutation as ERP authority |
| Existing custom statuses / empty-state preview | Local simulated view | No artificial Empty state preview or sample rows in live mode. Existing live empty/loading/error/denied states remain explicit |

## Reuse boundary

The generic screens directly read/write `useApp` browser-local records, use local item/vendor masters and numeric `Line` amounts. Mounting them unchanged would create false persisted behavior and financial rounding. The live adapter therefore retains domain-specific exact transport/forms while reusing existing list, table, toolbar, tabs, section, activity, field, floating selector, modal and sticky-action presentation. No parallel sidebar, module shell or service page was introduced. Reference mode retains the original screens.

Vendor return context is preserved only for a valid internal vendor ID and current vendor-read permission; editor/detail links retain that context without granting record access. Purchase-order deep-link auto-selection still needs a scoped source lookup/filter contract. The UI keeps canonical source selection and an authorized Related source link; it never treats an arbitrary URL as source authority. Automatic deep-link selection remains an explicit adapter enhancement, not verified parity. Delivery document bytes, comments, export/import/print and richer query/sort require owning backend contracts before activation.

## Evidence and verification to run

Three additional authored browser cases cover shared table/selection/columns with unavailable export, retained detail tabs with unavailable comments/files, and source form/discard behavior. A client contract case checks supported worklist state versus unsupported task filtering. Existing13 cases retain current company/branch headers, exact quantities, overdelivery truth, named purpose tasks, privacy, current source CAS, stale navigation and unknown-write recovery.

All modified presentation and transport now require the serialized unit/TypeScript/build/browser gate; none is claimed passing. Purpose-only privacy restrictions, missing-capability default false, actor/scope keys, original command payload/key and authoritative server guards must remain intact during fixes.


## Actual backend browser gate completed — 20 October 2026

Source-only warnings above describe earlier checkpoints. The fresh private
`20261020_153636_browser` fixture subsequently passed both serial actual API
Playwright cases (**2 passed, 2.8m, exit0**) on test `a563616` and the unchanged
frozen `132ab18` app bundle (HTML/JS/CSS hashes rechecked OK). All eight UI
commands, exact decimal/source/version assertions, purpose-role denials,
response replay and complete command/privacy assertions passed. Procurement
business responses were forwarded to the real API; only ERP shell presentation
and test authentication were synthetic.

Graceful server shutdown then passed the independent owner-side database
verifier with exit0: physical2/qualified2/accepted1/held1; two service0.5/net50
certificates; independent workers; conserved PR/PO counters; eight command/audit
records and five outbox effects; no invoice/AP authority. The API and preview
were stopped. Owner-private evidence includes per-response traffic and terminal
logs; production was not deployed.

The first combined180-second case timed out after partial execution; its trace,
screenshot, logs and incomplete DB remain preserved under
`20261020_151917_browser`. Its owner verifier correctly rejected completion.
The successful retry used a fresh DB and split the same assertions into goods
and service cases, retaining180 seconds per case without changing app assets
or API request timeouts. This completes the receiving integration checkpoint,
not all Procurement features or production release gates.
