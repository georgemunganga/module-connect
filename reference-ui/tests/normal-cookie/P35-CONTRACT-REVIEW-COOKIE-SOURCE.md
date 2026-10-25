# P35 normal-cookie internal review browser source

This source extends the existing ERP contract editor, rate panel and assigned review worklist. It is unrun until an isolated private P35 runtime produces the exact 15-minute `p35-contract-review-cookie-fixture.private.json`. The backend hook supplies ten synthetic workerless Core accounts and a challenged completion file; its completion only closes the runtime window. It does not certify the browser or owner graph.

## Purpose and boundary

The buyer signs in through normal `/api/hrm/auth/login`, selects the fixture company and branch, creates a **new** contract for the fixture's already eligible supplier, adds an exact-value rate, and submits for internal review. A different signed-in reviewer opens the current Core assignment and returns it. The buyer corrects and revises the draft, resubmits under a new key, and the reviewer approves that new assignment. Both sessions log out and must receive 401 from `/api/procurement/v1/context` afterward. The browser records original request bodies, idempotency keys, responses, server versions and GET-only original-key recoveries in a protected private file. The created contract must differ from the native fixture contract.

The browser performs no signature, activation, supplier dispatch, Finance posting or production action. Internal approval is a P35 state, not an active or signed supplier contract. Private subject headers are forbidden at the proxy. No route mocks, business response substitutions or demo state are allowed. Chromium trace, screenshots and video are off, with one worker and zero retries. Fixture, TLS keys, proxy receipt and result are private files; evidence includes no passwords or cookies.

## Source trace

| Step | Existing UI | Real API and authority | Evidence |
| --- | --- | --- | --- |
| Draft and rate | `LiveContractEditor`, `ContractDraftRates` | `POST /api/procurement/v1/contracts`, then `POST /contracts/{id}/rates`; current company, buyer and supplier | New contract ID, exact draft and rate request bodies, current retained version |
| Submit and correct | `ContractInternalReview` | `POST /contracts/{id}/internal-review/submit`, then `/correct`; buyer, current branch and CAS | Distinct original keys, body, original-key GET, current state/version |
| Return and approve | `LiveContractReviewWorklist`, `LiveContractReviewDetail` | Current assigned Core review, `POST /contracts/{id}/internal-review/assignments/{assignmentId}/decide`; independent reviewer and CAS | Assignment, request body/key, original-key GET, new submission and final Approved state |
| Session closure | Existing local identity | Real logout, then context 401 for each cookie | Revocation booleans and challenged browser completion |

The feature contract remains in the ERP repository's P35 internal review feature specification. Actual persistence, audit, outbox, role grants and unchanged non-P35 records require an independent read-only owner verifier after the browser run. This source file and a passing UI test alone do not prove those facts.
