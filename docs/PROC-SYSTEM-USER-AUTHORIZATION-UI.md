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

### Executed local gate

Application commit `1c88b4a` passed **228 unit tests / 28 files**, TypeScript and a staged live production build. The build generated 112 canonical routes; frozen bundle assets are `index-CDXUC27u.js` and `index-B_T57PCm.css` (the existing nonfatal large-chunk warning remains).

Final browser run at test-only commit `a15965d`: **56 / 56 passed**, one Chromium worker, zero retries, 2.8 minutes. Contract, purchase-plan and purchase-request CRUD fixtures explicitly have `workerId: null` and a separately specified synthetic Core principal. Vendor and system-user access cases include read-only grants, role-only denial and workerless form access. This is mocked HTTP workflow proof, not backend or real-login proof.

Two earlier browser runs are retained: first stopped after 1 pass because an old read-only test treated permitted read/simulation as forbidden; second stopped after 18 passes because the request test expected the old denial wording. Test-only corrections permit the actual read-authorized, non-persisting buying-policy preview and assert the centralized permission-denied text. No application guards were weakened. A source-hash comparison confirms the verified application remained unchanged through the final run.

Private evidence: `/home/amizo/procurement-system-user-ui/reference-ui/artifacts/system-user-workerless-followup/`; source manifests and original failures are retained in adjacent directories. Frozen bundle: `/home/amizo/erp-backups/procurement-ui-20261022/system-user-1c88b4a-static/` with a separate SHA-256 manifest. No production deployment, schema or backend change was performed by this gate.

A separate, **unverified** source patch `46b92ed` on `codex/procurement-uncertain-http-ui` narrows invoice/approval timeout classification and is not included in this application verification.
