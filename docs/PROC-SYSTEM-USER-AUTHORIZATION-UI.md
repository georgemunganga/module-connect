# Procurement UI: Core system-user authorization

User correction: Procurement is available to an authorized Core system user with assigned action permissions and company/record scope. An HR employee link is optional. Administrator roles alone do not grant actions, and the absence of an employee does not imply read-only access.

## Contract

The context must contain a real server-validated `principalId` (the current active `CoreLocalUser.Id`), nullable `workerId`, valid tenant/company/currency and an explicit permission list containing `procurement-access`. Missing principal IDs are rejected; the UI never substitutes an employee ID or generates a runtime identity. Legacy `adminViewOnly` is ignored for authorization and exposed as false only for source compatibility. No action grants are inferred from displayed roles.

General CRUD uses exact server-granted actions, current record state and available server capabilities. Request submission and withdrawal use their separate existing permissions. Plan/contract create and edit controls now check their actual grants. Employee-derived global mutation restrictions and the employee-required administrator notice are removed. Context-bound component and journal keys identify the system principal, company and branch rather than collapsing workerless users into an `admin` key.

Operational approvals, receipts, matching and sourced orders still depend on their real server-provided availability/eligibility and current permissions. The UI does not force capabilities on or infer unavailable workflows merely from optional employee presence. Backend routes remain authoritative for actual scoped action decisions and specific evidence requirements.

## Verification

New unit cases cover workerless permissioned contexts, optional employee projection distinct from principal, administrator roles without inferred grants, invalid/missing principal, missing access grants, company mismatch, schema mismatch and optional capability defaults.

Existing mocked context responses now explicitly declare a synthetic Core principal independent of their employee fixture. Prior plan/contract mocks that omitted permissions now explicitly name the actions their CRUD tests exercise; read-only fixtures remove mutation grants rather than relying on absent employees. New browser cases cover system-user form access, role-only denial and read-only action hiding. These mocks are not real authentication or backend authorization proof.

Compilation, unit and browser evidence will be recorded separately after execution. Backend context/ownership integration must be deployed with this UI contract; an older API without principalId intentionally fails closed.
