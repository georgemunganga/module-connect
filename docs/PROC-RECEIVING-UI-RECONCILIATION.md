# Receiving UI reconciliation

Source only, verification pending. This candidate reuses the already implemented receiving screens/client from held UI source `cc18432`, onto current CRUD controls source `233d3d9`. It preserves the verified vendor/editor/settings/shell changes. It does not enable a backend capability, migrate, or deploy.

The four specific receiving capabilities default false when absent; the generic receiving flag does not open these routes. Current server permissions, issued order evidence, source versions, inspection/service assignments and exact quantities remain authoritative. ERP administrator read-only behavior stays intact. Tenant identity is included in remount/recovery-memory scope alongside company/branch/worker.

Imported files were byte-identical before the scoped tenant-key and synchronous in-flight guard additions. Source hashes follow. Original author/history remains retained in the source branch; no published history is rewritten. Existing mocked/real-browser contracts are imported for re-verification, not claimed as passing on this candidate.

```json
[
  {
    "path": "reference-ui/src/features/LiveReceiving.tsx",
    "sha256": "8216a46af2bc5773765ddbae36aa602a3ede0a4da6b1575b942c82325faea4c4"
  },
  {
    "path": "reference-ui/src/features/LiveReceivingEditor.tsx",
    "sha256": "53214ee84a600887c558f85b0490b53f26b0f3e14c009c8a51f1dd190d0ded88"
  },
  {
    "path": "reference-ui/src/features/ReceivingPresentation.tsx",
    "sha256": "514118d1892724399ef5867b0d2c235629a92a8c8c366de33c80c93bad7daf5f"
  },
  {
    "path": "reference-ui/src/lib/receiving-command-memory.ts",
    "sha256": "d12f32729f583296fa8ae579cfdfaafa73fa714e8f27f4f92e78364e9a5784be"
  },
  {
    "path": "src/platform/procurement-receiving-api.ts",
    "sha256": "fde27bba27c108cf6e2980d8ed56d0281642b8262737e4884ac7ca11a6dc89de"
  },
  {
    "path": "reference-ui/tests/e2e/live-receiving.spec.ts",
    "sha256": "eef3148bb207b5ab5e8648567be604382f6e9ddf32c9edafa0acc150d8fbfe20"
  },
  {
    "path": "reference-ui/tests/receiving-contract.test.ts",
    "sha256": "0b34bc7be8a5cf9c0bc142b58459a03b4492f357770c7877613c639c3938c54b"
  },
  {
    "path": "reference-ui/tests/backend-browser/RECEIVING-CONTRACT.md",
    "sha256": "b4759c3af51223688b5a13ab089445f51b8109898fc42288e5f7768eb14e053b"
  },
  {
    "path": "reference-ui/tests/backend-browser/receiving.spec.ts",
    "sha256": "420799dde680bc03eb08144a9d1a67e9321225f8c8d4668b40452d7ba35ce799"
  }
]
```

New guards synchronously prevent a second command or recovery request before React has rendered its busy state, and refuse commands after unmount. Existing backend idempotency/recovery remains authoritative. These additions require new focused browser verification before release.

## Principal receiving successor adapter — source only

This isolated increment starts from published P29 UI source `a72089b` and consumes
ERP receiving successor source through `b98dc6d7` (integrity `ef5f9c00`, verified
UI projections `352c3da4`). It does not publish assets, register routes, enable
flags, install dependencies or claim executed acceptance. The original backend
28-section source contract remains `docs/procurement/PROC-09-PRINCIPAL-RECEIVING-SUCCESSOR.md`
in the ERP repository.

1. **Purpose:** connect the supplied receiving UI to principal-owned receiving.
2. **Scope:** goods/service draft CRUD, physical recording, named inspection,
   goods acceptance, service certification and original-result recovery.
3. **Actors:** canonical Core accounts; an employee link is optional.
4. **Identity:** existing shared ERP auth/context only; no token or worker parser.
5. **Access:** existing explicit receiving/service permissions; no grants added.
6. **Data scope:** existing company/branch headers; scope/auth changes unmount and
   abort/ignore old callbacks. Pending references include tenant/company/branch,
   canonical principal, protocol, kind and target.
7. **Domain:** separate physical, inspection and positive acceptance records.
8. **Sources:** real scoped principal-source endpoint, exact issued/line/site pins.
9. **Ownership:** server draft candidates determine edit/cancel; UI cannot infer
   ownership from worker, permission or a selected ID.
10. **State:** server statuses/versions remain unchanged. Principal filters expose
    only supported Draft/Recorded/Certified/Cancelled values.
11. **Rules:** current policy/independence/capacity remain server decisions.
12. **Assignments:** purpose inspection/acceptance/service queues require only
    the matching action; no broad receipt-read prerequisite on assigned tasks.
13. **Values:** exact plain decimal strings; no Number conversion, rounding or
    acceptance from an empty/unknown history. Unchanged original receive timestamps
    retain their full server precision while the editable control shows milliseconds.
14. **API:** explicit `/principal-*` successor paths; existing legacy transport
    remains distinct. Protocol references cannot cross replay engines.
15. **Commands:** stable UUID/body for one operation; no automatic POST retry.
16. **Recovery:** GET-only original key/operation lookup, including unknown-create
    target discovery. A returned result is status **when saved**, followed by a
    current scoped GET; it is not a new replay authorization.
17. **Errors:** known validation permits correction; stale/denied detail clears
    prior state and reloads; malformed acknowledgments/network/5xx preserve the
    original pending command and block another write.
18. **Audit/history:** verified backend history is rendered; nonfinancial events
    have nullable value rather than a made-up zero posting.
19. **Documents:** existing document/comment/related sections remain; unsupported
    owner actions retain truthful explanations.
20. **UI/layout:** same LiveReceiving list toolbar, filters, columns, selection,
    preview, detail sections/tabs and action placement. The editor now uses the
    existing `TransactionEditorFrame`, existing vendor/reference band, line table,
    physical/service sections, notes/attachments and sticky action footer.
21. **Purpose privacy:** omit maker identities, notes, commercial prices and broad
    documents from assigned tasks. Missing service amounts display unavailable,
    not zero. Actual source-line UUID stays separate from logical receipt line.
22. **Operations:** no inventory, asset, invoice/AP or Finance posting claim.
23. **Capability:** only explicit `principalReceiving === true` selects the new
    adapter. Absent/unknown=false. No worker or permission implies support.
24. **Compatibility:** legacy receiving flags/adapters remain operationally
    separate. When supported, the existing screen's receiving-record selector
    retains earlier records and carries that protocol through detail/edit links;
    no automatic cross-engine fallback or replay occurs. Missing principal
    capability never restores browser-local records.
25. **Tests authored:** seven focused contract unit cases and eight mocked browser
    scenarios, plus existing receiving regressions retained. These are not live
    API/SQL/authorization/visual acceptance evidence and have not been run.
26. **Verification pending:** unit + TypeScript + staged build, focused new and
    existing receiving browser checks, parity at desktop/mobile, then actual
    backend/browser/independent owner/counter/receipt proof against genuine DDL.
27. **Limitations:** pending commands are browser-lifetime memory, not a durable
    local queue. Keep/copy the original command reference before closing. Full
    draft editing continues to require existing read+edit semantics; assigned
    task users do not acquire broad reads. Corrections/returns remain unavailable
    without authoritative consumption-owner support.
28. **Release hold:** backend successor readiness is unavailable and routes are
    unregistered until central migration/provider/finite-runtime proof. No merge,
    deployment, production readiness or all-system completion is implied here.
