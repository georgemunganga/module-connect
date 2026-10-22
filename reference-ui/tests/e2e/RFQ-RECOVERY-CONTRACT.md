# RFQ browser recovery — source candidate

The actual exported RFQ list/editor/detail routes dispatch approved-source requests to the existing governed API and retain separate ad hoc CRUD routes. No publication, invitation or award is enabled here.

Before each governed Create/Cancel POST, sessionStorage must successfully retain and read back a validated recovery reference. The key includes tenant, company, current worker, selected branch and operation/event. Only UUID, operation, event ID, and cancellation expected CAS/original fingerprint are stored. Titles, reasons, source lines/quantities, credentials and complete commands are never journaled. Full commands may remain in the existing browser-memory Map; they are not a retry queue.

A hard reload restores a separately typed locator, never a POST body. Recovery reads only the original command receipt GET, verifies operation/UUID/status/event and cancellation CAS/fingerprint, then clears the journal on confirmed result. Confirmed POST success and known 400/422 validation rejection also clear it. Unknown/403/404 outcomes retain it. Malformed or unavailable storage blocks new writes without silently deleting the locator; a missing journal with an existing in-memory command also blocks writes. A different unresolved locator cannot be overwritten.

Session storage is tab-lifetime recovery, not a durable server queue or cross-browser guarantee. Closing/clearing browser storage can remove the reference; server idempotency, scope and current authorization remain authoritative. No automatic POST or authority claim follows from storage.

Authored, not executed in this source-only increment:

- Six journal unit cases cover minimal payload, cancel binding, malformed/oversized/extra fields, unavailable/discarded writes, scope separation, non-overwrite and GET-only response verification.
- Existing seven governed mocked cases remain, plus hard reload after a lost partial create, malformed storage and unavailable storage with no POST.
- Explicit exported ad hoc editor/detail route regression retains original CRUD without recursion; governed route tests exercise exported editor/detail dispatch.

Required parent gates: unit/TypeScript/build, all governed and legacy browser cases, then actual finite-role API/PostgreSQL approved-source workflow. Mocked browser cases do not prove business authority, conservation or persistence. Operational capabilities remain false unless the owning server already reports genuine readiness.
