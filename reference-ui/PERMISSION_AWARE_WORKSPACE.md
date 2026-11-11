# Permission-aware Procurement workspace

Change tracking: module-connect issue114. The workspace consumes effective permissions from the existing scoped Procurement readiness/context contract. Role names, job titles, employee linkage and visible menu items do not create authority.

## Shared presentation contract

`src/lib/procurement-page-access.ts` defines page/operation entry. The live sidebar, grouped navigation, quick-create menu, workflow-guide links, settings affordances and direct-route guard reuse it. An empty/unavailable grant hides destinations; unknown page families fail closed. Demo presentation remains separate. The server remains authoritative for every action, record, current state and tenant/company/branch/owner scope.

| Surface | Required existing authority |
| --- | --- |
| Home | Procurement module access; individual panels require their domain permissions |
| My Requests | Request read; creating/editing/submitting retain their distinct permissions |
| Approvals | Assigned queue read, approval-opening work, PO approval or the relevant plan/round/invoice task authority |
| Suppliers and items | Their existing read/create/edit/manage permissions |
| Sourcing and orders | Existing sourcing/quotation/round or PO permissions for the selected operation |
| Receiving | Receipt viewing for general records; dedicated inspection/acceptance/service-certification authority for their permitted work queues and assigned task URLs |
| Contracts, plans, recurring purchases | Existing record read/create/edit permissions; plan-review-only entry is retained |
| Bills, credits and payments | Existing invoice or payment permissions for the selected operation |
| Budgets | Budget-check authority |
| Analytics | At least one existing PO/plan/contract/invoice read grant; each reported dataset remains separately permission-checked |
| Procurement settings | Existing configuration read/edit/approval authority |
| Core organisation profile | Existing ERP/HR administration role, independent of Procurement access |

A request-only role sees Home and My Requests, with its request-creation action. It does not see purchasing/payables/approval/configuration menus or unrelated Home panels. A direct forbidden URL shows a permission-denied message inside the shared shell before branch selection or mounting domain components. Users with allowed workflows retain the supplied layout and shared ERP controls. Authorized but unavailable capabilities keep truthful availability messages; an unavailable capability is not a permission grant.

Home filters stats/personal cards by domain read permission, hides spend/payables/attention panels where unrelated, and retains permitted request activity. Bill and payment subpanels are independently gated. Record actions still use the existing feature-level guards. The secondary Purchase Requests navigation entry is reserved for users with purchasing/triage access to avoid duplicating My Requests for ordinary requesters.

## Behaviour retained

Approval openers can reach their starting queue without assigned-queue reading. PO approvers can reach assigned detail without broad PO listing. Inspectors, acceptors and service owners can reach their purpose-specific tasks without general receipt access. Each backend still verifies actual assignment/scope. Page checks do not grant spending authority, change company policy, add permissions or alter records.

The existing readiness boundary fences identity/company/branch changes and aborts obsolete reads. This change does not introduce a separate role engine, backend schema, migration, workflow or finance ledger. Batch payment execution remains unavailable.

## Verification and release

The permission matrix has unit checks for request-only access, separate read/create/edit rights, configured reviewers, purpose-specific receiving and explicit module grants. Browser cases cover desktop/mobile menus and shortcuts, denied direct URLs without domain requests, configuration visibility, assigned approvals/PO tasks, receiving, and the existing guided request/branch flow. Results and real read-only deployment observations are recorded in the PR/release receipt. Customer identities, credentials and raw screenshots stay in private operational evidence.
