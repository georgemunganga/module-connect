# RFQ evaluation-plan source integration

[ERP milestone173](https://github.com/georgemunganga/erp/issues/173), [backend draft PR165](https://github.com/georgemunganga/erp/pull/165), parent145. Independent UI branch from canonical main `1e7922ae178351fa006bdf4a9aaeb44bc903f94e`; it does not depend on pending Purchase Plan review PR103. Initial audited B1 backend source: `7ff14298117daf9b19ec5d301139693a19c272e2`.

This is source work in progress. Initial bounded client checks are recorded below; no final build, browser, native acceptance or deployment has run for this change. Root owns the active backend SDK slot and all runtime/database stages. The source API still needs the gaps below resolved before the UI can be bound completely.

## Original presentation map

The canonical live RFQ is `reference-ui/src/features/PrincipalPublication.tsx` within `RfqPresentation.tsx`'s existing Overview, Items, Related, Comments and History tabs. The preserved imported source presentation in `src/routes/procurement.sourcing_.$id.tsx` has Requirement, Evaluation criteria, Eligibility and terms, Internal colleagues and Response documents cards. Bind those same groups inside the shared live RFQ Overview rather than mounting the demo route or making a new page. Existing Items/source links and publication controls remain in place. Shared `DetailSection`, `Panel`, `RecordTable`, `Field`, `Input`, `Select`, `Textarea`, `Button`, `Badge` and `Modal` provide the presentation.

| Existing surface | B1 source / effect |
| --- | --- |
| Requirement / Eligibility and terms | `content.requirements`, `proposedPolicyReference`, `disclosureProposal`; proposal only, no adopted business policy. |
| Evaluation criteria | Full retained `content.criteria`: logicalId/order/code/stage/kind/description/rubric and optional exact decimal-text weight/minimumScore/maximumScore. PassFail has no score fields. No prefilled approved weights or thresholds. |
| Internal colleagues / Team | `content.participants`: logicalId/order/current Core principalId/duty/conflictNote; read names from retained detail's `people`. No employee identity requirement and no permission assignment by adding a participant. Picker prerequisite below. |
| Response documents required | Proposed text `content.documentRequirements`. No upload, invented document IDs, verified attachments or scanner claim. |
| Bidding preferences / schedule | Optional browser-local date controls serialize edited opensAt/closesAt/technicalReleaseAt/commercialReleaseAt to exact UTC instants. Saved version captures actual companyTimeZoneId. Saving neither schedules nor releases bids. |
| Existing History | Cursor GET history and exact version GET; version evidence remains distinct from current mutable plan CAS. |
| Existing detail action area | Explicit create/enrol, revise or cancel. Do not automatically enrol a newly created RFQ. Once enrolled, future review/publication remain visibly unavailable. |
| Existing M4 supplier/review controls | Preserve working flow for unenrolled RFQs. Enrollment is the barrier; `enrolled:false` future flags alone must not disable M4. Missing/new metadata defaults false. |

## Owning APIs

Paths begin `/api/procurement/v1/sourcing/{eventId}/round-plan`. GET current detail, `/history?afterVersion=N&limit=25`, `/versions/{version}` and `/commands/{key}` require current round-plan READ and scoped actual Core principal. Company All supports these finite retained reads; writes require the explicit event branch. `/sourcing/round-plans` lists enrolled records only.

POST base creates and explicitly enrolls an actual untouched, unpublished M4 principal RFQ Draft with current held approved demand. Input `{expectedEventVersion,draft}`. POST `/revise` sends `{expectedEventVersion,expectedPlanVersion,draft,reason:null}`. POST `/cancel` sends `{expectedEventVersion,expectedPlanVersion,draft:null,reason}`; reason is required/trimmed/max2000. Server validates states, permissions, participants/current scope, event and plan CAS, original source evidence, PR holds, lock order and audit/outbox. Cancelling a plan retains enrollment and versions; it does not release demand or cancel the RFQ. Only the existing authorized source cancellation can release its holds after plan cancellation.

All three use Idempotency-Key. Receipt pins actual eventId/planId/revisionId/result version/status/operation/commandKey plus false reviewAvailable/publicationAvailable. Original create/recovery returns HTTP201, revise/cancel200. A metadata-only original-actor/company/branch/auth/tab journal blocks a second command after an uncertain response and permits GET recovery without writer capability. It stores no draft, criteria, scores, conflict notes or command body. No automatic new key/repeated POST follows unknown response or scope change.

Criteria and participant logical IDs survive revisions; physical revision IDs identify immutable saved versions and are never substituted for child logical IDs. Full-set revise retains all supplied fields and deliberately removes only omitted rows. All score/weight decimal fields are exact quoted18,4 strings; validation and comparison use text/scaled BigInt, never Number. Current and historical response monetary/scalar fields must retain their exact wire values.

## Contract prerequisites reported before guessing

- RoundSourceView currently omits current event version/status despite mandatory command CAS. Add verified current fields; do not borrow a maker-only M4 loader for a different round handler.
- Round-only handlers cannot obtain source method/verified retained lines for the existing Items tab through current RoundRead. Expose them through round-scoped source access without globally relaxing M4 maker access. Existing round list includes enrolled records only; unenrolled source discovery needs an explicit contract or an existing maker link.
- No participant picker is admitted by round permissions. Existing sourcing-reviewers lookup needs configuration READ and sourcing-publish, excluding valid planning/evaluation participants. Need a finite event-branch scoped current Core principal picker with paging/targeted retained names, no employee prerequisite.
- Current metadata roundPlanRecord also requires manage, although cancel has an independent cancel grant. Need authoritative action admission for valid cancel-only actors without bypassing a false capability.
- Existing M4 publication detail does not expose enrollment/barrier flags. Surface server enrollment/action availability so the old flow remains working for unenrolled drafts and enrolled barriers are shown honestly, including accounts without round READ.

Backend owner/Root was notified before implementing API-dependent discovery, action hints or source fields. Those gaps are not silently replaced by fake people, first-branch fallback, guessed versions, arbitrary IDs or broad maker access changes. Submit/review/decisions/publication and evaluation execution remain unavailable in B1 draft scope.

## Draft checkpoint, before DTO binding

Root approved the backend gap batch above; the backend author is preparing exact fields/endpoints. No substitute fields or expanded M4 maker access have been added in this UI. Source currently contains the scoped API adapter, minimal recovery journal, literal-true metadata parser, action restrictions, and reusable original-card form/evidence/history/editor components. They are not yet mounted into the RFQ routes. The draft PR is a reviewable checkpoint, not a completed UI milestone or release candidate.

The date controls use shared `Input type="datetime-local"` with millisecond editing and the displayed browser time zone. The adapter converts only edited local fields to UTC; unedited retained instants, including their original six-digit fractional precision, remain unchanged. The company zone is retained as evidence and is never silently interpreted as the browser zone. Supporting-file availability uses plain language. Criteria/participants retain logical IDs and full fields; the editor binds CAS to the content opened for editing so a background refresh cannot silently advance its versions.

Bounded verification so far, Node22 / heap512 / nice10 / one worker:

- Initial WIP `tsc --noEmit`: passed before the subsequent lifecycle/date edits. **No final typecheck claim for this checkpoint.**
- Initial two-file Vitest run: 115 passed, zero failures/skips/todo: `round-plan-api.test.ts`17 and `procurement-live.test.ts`98 (`unit-wip01.json` / `.log`). This preceded the date adaptation.
- Separate focused date file: `round-plan-schedule.test.ts`3 passed, zero failures/skips/todo (`schedule-unit01.json` / `.log`). Covers actual browser-zone conversion, unchanged microsecond instants, empty values, malformed/impossible local dates and timezone-suffixed local input rejection.
- No build, browser, normal-cookie/native UAT or deployment. No hosted CI success claim.

Artifacts remain outside Git under Root's scoped UI evidence directory. The final source binding, final typecheck and affected regressions will follow the actual backend DTO successor and complete route/picker/action integration. Review/native publication remain unavailable, and old M4 behavior is unchanged by these unmounted checkpoint components.
