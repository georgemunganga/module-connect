# Procurement Home layout restoration

23 October 2026. Reuse the original Dashboard from ERP-adapted layout commit `d104f596183e7a012a04578a679aac795e1489d4`. The live route still owns data loading and passes an explicit model into the shared original Dashboard layout. Live rendering receives no demo records.

## Preserved presentation and integrations

Original greeting/header, Dashboard/My Requests navigation, date-range position, Spend Summary beside Attention Required, four linked summary tiles, Payables Summary and Recent Activity. Shared ERP components and Core branding/tokens remain. The previous live request/order/plan/contract counts remain below these sections rather than being discarded.

The existing scoped list APIs supply order, invoice, published catalog and vendor counts. Labels describe records/entries, not issued orders, paid bills or active suppliers when those facts are not established. Existing assigned-approval reads require the current action grant and legacy/principal approval capability. Recent Activity explicitly shows saved purchase requests from the current loaded page, not an invented global audit feed. Refresh sends reads only. Auth epoch, principal, tenant, company, effective/header branch, permissions and capabilities bound the result context; cleanup aborts old loads.

Spend totals, chart, payables balances and payment values remain unavailable within their original sections until authoritative reporting is connected. The date selector is visibly disabled with its reason; record counts cover all dates. No fake trend, demo person/company, guessed money, Finance activation, schema change or permission grant.

## Verification

Application source `5eb6380`; test-only correction `6b40d85`. Live-mode staged build/TypeScript passed. All 16 focused browser cases passed with one worker, zero retries/failures/skips/flaky results. They cover original layout, live counts, links, read-only/no-query behavior, failed reads, Refresh, principal-only approvals without employee linkage, auth invalidation, desktop1440 and phone390 overflow/screenshots, and existing catalog/analytics behavior. Desktop and mobile screenshots were inspected.

Business HTTP is mocked: these tests do not prove new API/PostgreSQL persistence. There are no new mutation endpoints. The first run retained 15 passes and one outdated expected catalog-denial text; the existing scoped route guard denied before querying. The corrected assertion retains both no-query checks. Application and staged asset bytes are unchanged in the successful rerun.

Private receipt `/home/amizo/erp-backups/procurement-home-layout-20261023_run02/result.json`, SHA256 `e99e718a817679f05260638efa6d0d934aed7d6eebcc2405922261cf086ed9df`. Public deployment is a separate verification step; no whole-module completion is claimed.
