# Actual sourcing policy settings browser gate

Source-only authored gate; **not executed**. Uses the existing Buying rules page and shared ERP controls, with application source unchanged from verified `8226f82` (documentation/test baseline `eaca0d1`). No installed dependencies, generated assets, API/server or database are created by this test.

The operator starts the restricted private `ApprovalHttpPostgresProbe --serve --sourcing-policies` mode and supplies its owner-private manifest through `PROCUREMENT_APPROVAL_BROWSER_MANIFEST`. The existing `playwright.backend.config.ts` runs one worker against the exact staged `.verification-dist` candidate. Parent owns resource scheduling, API/database lifecycle and fresh owner verification on graceful server stop.

## Manifest contract

Existing loopback transport fields: `baseUrl` (HTTP 127.0.0.1 with port), `tenantId: probe`, `companyId`, `branchId`, `currencyCode: ZMW`, `authenticationHeader: X-Probe-User`.

`actors.maker` and `actors.reviewer` each contain canonical `principalId`, `workerId` and raw actual Procurement `context`. They are distinct workers with finite configuration roles, without ERP admin. Maker has configuration read/edit; independent reviewer has configuration read/approve. Named approver is a picker identity, not a grant of operational publication authority.

`sourcingPolicy` contains `policyKey: SOURCING`, `currencyCode: ZMW`, maker/reviewer principal IDs, `namedApproverPrincipalId` (manager2), `namedApproverDisplayName: manager2`, `effectiveFrom` (future UTC midnight), `effectiveTo` (following UTC midnight), `expectedConfigurationVersion: 1`, `noPolicyEffectsSeeded: true`. Actual owner readiness must produce the version marker; no response or readiness provider is mocked.

## Single actual workflow

1. Maker explicitly selects SOURCING, company-wide coverage, zero minimum quotes and invitees, all three requirements false, one All step with named manager2.
2. Rule `BROWSER_POLICY`, priority zero, minimum amount input `0.0000` (canonical exact zero), upper amount null. This intentionally provides full amount coverage; no invented finite business threshold. Step code `BROWSER_REVIEW`, assignee ProcurementManager.
3. UI validates and creates exactly one policy (201); actual response retains all zero/false values, Core ZMW and selected identity. Reload and reopen the same ID without editing or an extra save.
4. Maker submits with `Browser independent review requested`; independent reviewer publishes with `Browser independent sourcing settings approved`.
5. Reload and real scoped detail GET prove the same ID, unchanged original rules and Published state/actor.

Exactly three policy mutation POSTs are permitted: create, submit, publish. The validation POST is read-only and separately excluded from that count. There are no retry loops, response-loss simulation or invented idempotency guarantees: policy CRUD currently has no durable command receipt contract. The backend fixture must retain original source state, exactly three identity stages and expected policy/audit changes, with no RFQ, Finance, Core approval-case or outbox effects; browser assertions complement, rather than replace, stop-time owner verification.

Every `/api/procurement/` call is forwarded unchanged to the actual private API with its finite actor and actual selected company/branch headers. Only outer HRM authentication, branding and shell presentation are synthetic. Traffic is written as a concrete owner-private test artifact even on failure; failure traces are retained. No passing runtime claim is made until parent records the actual browser and persisted-owner results.

Run only in the assigned resource slot with the existing backend browser configuration and test filename `sourcing-policies.spec.ts`; no source or application rebuild is required solely to add this test when staged application inputs remain identical.
