# P35 internal contract review UI trace

This extends the imported ERP contract list and detail. The supplier contract remains
unsigned and inactive after an internal `Approved` decision. Rates and the exact
spending limit shown to a reviewer come from the frozen submission, not a later draft.

| Screen or action | Backend route | Current Core action | UI guard |
| --- | --- | --- | --- |
| Submit the current draft | `POST /contracts/{id}/internal-review/submit` | `procurement-contract-submit` | Draft, selected branch, version, distinct capability |
| Assigned reviews | `GET /contracts/internal-review/assigned` | `procurement-contract-review-read` | Exact current assignment ID from scoped server projection |
| Read frozen terms | `GET /contracts/{id}/internal-review/assignments/{assignmentId}` | `procurement-contract-review-read` | Assignment and current account/branch context |
| Approve, Return, Reject | `POST /contracts/{id}/internal-review/assignments/{assignmentId}/decide` | `procurement-contract-review` | Three current versions; reason for Return/Reject |
| Correct returned review | `POST /contracts/{id}/internal-review/correct` | `procurement-contract-submit` | Returned contract and current version |
| Check an uncertain write | `GET /contracts/internal-review/commands/{key}` | Current action and original actor | Original key, operation, contract and acknowledgement checked |

The browser keeps only a scoped command key locator in session storage after a write.
An uncertain response blocks another POST until the original result is checked. The
reason, terms, credentials and supplier data are never stored in that locator.

`contractInternalReview` is an optional, default-off server capability. The six
backend routes are mapped under an explicit P35 option. Metadata advertises the
capability only when that option and configured physical readiness are available;
each route additionally requires shared execution and rechecks current Core authority
and branch scope. Mapping
these routes is source preparation, not a production activation claim. The reviewer worklist
uses the additive `AssignmentId` projection; an older host without it renders an
unavailable link instead of substituting a submission ID. Signature, activation,
drawdown, dispatch and award remain separate workflows.

Focused Vitest and mocked Playwright cases are authored in this branch but have not
been run here. The terminal decision recovery case keeps the saved key when its
active assignment detail returns 404, then uses the actor-owned command GET without
sending a second decision. Genuine schema, positive private HTTP, normal-cookie and
independent owner acceptance remain separate gates.
