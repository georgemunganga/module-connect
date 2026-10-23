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
