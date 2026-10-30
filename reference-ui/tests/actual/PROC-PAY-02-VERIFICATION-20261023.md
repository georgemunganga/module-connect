# PROC-PAY-02 browser integration acceptance

Status: accepted in private integration environment; production release pending.

Application source: `9982b67`; browser harness: `adfd160`; actual API:
`d83fa712e073f35730182f05a10bbe37e6b88b08` (ERP PR44).
The later harness changes affect only browser waits and company selection.
The supplied Procurement list, editor and detail layouts and shared ERP controls remain in use.

Verification uses normal Core cookie sign-in against the real application and
PostgreSQL with finite runtime roles. It does not replace authentication, mock
API responses, inject an actor header, or require an employee record.

- UI run07: TypeScript and staged live build passed; 37 mocked browser cases passed.
- UI run08: complete payment journey passed: create, reload/revise, submit,
  independent approval, record an external payment, independent confirmation.
  Policy journey failed because the helper looked for the workspace switcher
  inside the separate settings header; that attempt is retained.
- UI run09: policy journey passed after choosing the company in the workspace
  before navigating to settings: author, return, revise and independent publish
  with explicit future currency limits. Application assets are unchanged from run07.
- Owner reconciliation passed: 3 requests; 16 versions, decisions, receipts,
  audit records and outbox records; 5 Core workflow links and decision links;
  4 company-date observations; 7 Core users; zero employees, employee links
  or Finance payment rows. Counts include the preceding real HTTP probe.

Earlier verification: 445 Vitest cases passed at `d764486` before the final
storage-error wording fix; native Node tests ran separately. This is not a claim
that the entire repository or Procurement module has completed acceptance.

Evidence is retained in owner-private `erp-backups/procurement-payment-ui-20261023_run07`,
`run08` and `run09`, including source fingerprints and the database reconciliation.
Credentials and the synthetic account fixture are excluded from this repository.

Payment upload, batch payments, bank execution and Finance Paid remain unavailable
and are explained in the existing controls. Manual confirmation records a reviewed
external payment; Finance accounting/payment integration remains a separate contract.
Production migrations, configuration, deployment, rollback and UAT are still required.


## Pending unknown-outcome journal hardening (30 October 2026)

The later UI change preserves the existing payment pages and separates a failed HTTP request from proof of a rejected command. Lost responses, scope/auth changes, 400/401/403/404, unknown 409/422, 5xx and corrupt success retain the original locator; the UI never automatically retries a mutation or generates a replacement key. Local input validation happens before claiming a key. Only a live first-mutation 422 with the current backend's exact `payment-state-changed` validation shape can create a volatile scope/key/action/id/exact-body witness. That witness keeps the key pending until the user explicitly selects **Review entries**. Caller-constructed errors and GET failures never grant that acknowledgment. No payment body, external reference or credential is added to session storage. A reload loses the volatile witness and keeps the locator for original-key recovery; it is not evidence that nothing committed.

Focused verification for source `dfaec3cb838a848c85d2096ab61e383dbde489ce`: 36/36 targeted Vitest API/view/production send-once journal cases passed (zero skips/failures), and TypeScript passed under bounded Node 22 with unchanged source/tool pins. Receipt `9c709c89d1585f4771e28d294b602eaf6e70ddf7610bd2b1db19230e23f0726f`, plan `f509c0c415cdbde4b74c82fff7f25cbdcee4df6fd7ec14868cfb422897dbc39f`. Both owned test scopes exited and became inactive. These are mocked transport/unit and type checks, not genuine backend/browser acceptance; the earlier private acceptance remains historical. No API, SQL, SDK, Vite build or browser was run by this verification.

Root-review successor `17740b2` additionally requires the exact current backend validation message (`Enter valid payment details and exact amounts before trying again.`), with the exact two-field `payment-state-changed` error body. The same code with a different message remains uncertain. After validating the live error against the exact original command body, the journal retains only an opaque acknowledgment and minimal scope/key/action/id metadata; the body-bearing transport witness is released. No complete payment command is retained by the module-global journal map. The successor passed **38/38 focused tests plus TypeScript**, receipt `358af4373fae49334f3733bba94027c144dd66943116463ccdd8bad1a669bea8`, plan `be2049faefb82dfcf633221bd54ddd8c9e349e0e1b3f0b5a853ce334819ca411`. The original 36-case result above remains a separate preserved source checkpoint. Browser/backend acceptance and production release remain pending.

Production-build and mocked interaction checkpoint `694022b`: Vite production build passed (actual asset manifest `6b0d6accd0855b9bba3871b3a5019f37a34ee9353d188041fc43427ad541ef9d`). All **13 mocked Playwright cases** passed: the original eight payment interactions plus lost-acknowledgment GET recovery, explicit known-validation review, unknown conflict, changed access and same-code/wrong-message preservation. All API requests were intercepted, unmatched API calls failed the cases, and external requests were blocked. No real backend, payment or production operation was exercised.

The first combined controller stopped before Chrome when its fresh memory floor failed; that veto remains preserved. The separately reviewed browser-only run completed its 13 assertions and stopped its scope, but its controller subsequently failed a plain socket bind with `EADDRINUSE` during cleanup classification. That original failure is retained and has no synthetic original COMPLETED receipt. A separate read-only reconciliation (`5f8515546d499770ff4d7b74569d3623c95ce4e2312c4008197b96b9c3958b3c`) rechecked exact source/assets/report, inactive owned scope, absence of owned child processes and listening sockets, and successful loopback reuse-address binding. It accepts the observed mocked assertions and cleanup without rerunning the browser or relabelling the failed controller. Original browser report: `61cc928c9658b77b391c5b5dd7583b83c65ea5a55b512ca5328f95ce0f682545`; original browser subprocess terminal: `ad021be8503e8f62cabb2a473c9aa6382a3615681dbffde99fc9264d215678a1`. Genuine backend/browser acceptance, retained-read separation and deployment remain open.

**Separate backend follow-up:** current manual-payment read/history/original-key routes and the UI boundary still depend on the same enabled/workflow readiness used for new work. Independent retained-read capability/finite-read profile is required before claiming flags-off payment recovery. This frontend journal change does not alter that backend policy, payment eligibility, Finance ownership, employee requirements, attachments or bank execution. Replaced-source/capacity picker previews remain a separate integration improvement; commands continue to enforce their authoritative source checks.
