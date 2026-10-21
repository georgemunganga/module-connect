# PROC-06 — Existing sourcing policy editor adapter

Status: TypeScript, focused unit, staged build and mocked browser checkpoint passed; not deployed or actual-API verified. Extends existing Buying rules page, not a new settings app or operational RFQ publication workflow. Backend source contract: `SourcingPublicationPolicyRules` and owned policy lifecycle; original-worker identity correction and owning schema readiness remain prerequisites.

## Feature framework addendum

1. **Identification:** Procurement → Configuration → Buying Rules → SOURCING draft/edit/preview/review/publication of configuration.
2. **Outcome:** explicitly configure publication controls and named ordered One/All reviewer stages without granting spending/publication authority.
3. **Scope:** existing company-wide-branch editor. Branch-specific/unknown saved schemas remain read-only; operational supplier dispatch/publication excluded.
4. **Related:** existing PR/PO policy editor and API, Core company/currency, canonical people lookup, controlled backend policy lifecycle.
5. **Actors:** current configuration readers/editors/independent reviewers authorized by server; no invented HRM role or new account master.
6. **Entry:** existing `/settings/buying-rules`; no sidebar/route added.
7. **Preconditions:** actual scoped context and configuration permissions. SOURCING requires typed lookup `configurationVersion:1`; missing/unknown marker blocks all sourcing mutations.
8. **Workflow:** select type → explicitly choose source controls/scope/counts/reviewer names/mode → validate → save draft → author submits → independent policy reviewer publishes/returns through existing APIs.
9. **States:** existing Draft/PendingReview/Published. Configuration publication is not an RFQ publication/sent fact.
10. **Permissions/scope:** server final; typed requests use existing shell company/branch headers. Editor remounts for tenant/company/worker/shell context/permission changes and ignores old callbacks.
11. **Rules:** no guessed quotes, invitations, flags or decision mode. Zero and false are explicit supported choices. Named people are not eligibility, finite grants or publication permissions.
12. **Data/ownership:** exact policy JSON belongs to Procurement; identity/company/currency belong to Core. No copied people/master or display names in authority JSON.
13. **Screens:** existing form/cards/table and shared ERP floating Select/Input/Button/Field controls; reusable per-step name search/select.
14. **UX:** loading/empty/denied/failed lookup distinct; selected IDs survive lookup/search/page failure. Unsupported definitions shown verbatim read-only.
15. **Notifications:** existing backend workflow only; no new message/delivery claims.
16. **Attachments:** only explicit requirement controls here; actual document-use pin/upload contract remains separate.
17. **Exceptions:** missing/unknown backend configuration version, unknown fields/assignees/branch conditions, alias/offboarding/server denial, stale CAS, unconfirmed save, context switch.
18. **API:** existing policies APIs plus bounded `GET /configuration/policies/lookups/sourcing-reviewers?search&offset&limit`; retained labels use optional `principalIds` with1–25 distinct canonical nonzero IDs, empty search, offset0 and limit25. Client chunks at25 and never enumerates all people; response must contain only currently visible requested IDs, matched total and no next page; minimal items `{principalId,displayName,workerId}`, total/offset/limit/nextOffset, `isAuthority:false`. Future `configurationVersion:1` MUST be owner-schema/readiness derived after original-worker identity fix, not constant/lookup reachability. Current unversioned backend stays unavailable.
19. **Audit/security:** authoritative backend actor/maker/checker/audit unchanged; no identity override payload. No raw private worker data in picker; exact current names only.
20. **Reports:** existing policy list/status; no operational readiness metric invented.
21. **Configuration:** current Core currency; no hardcoded company. Technical bounds follow backend controls/schema. Specific branch editing waits for an owning selector/contract.
22. **NFR:** bounded reviewer pagination/search with abort/stale-result protection; bounded duplicate-rejecting JSON lexer reused; thresholds never round through Number.
23. **Postconditions:** confirmed saved policy/configuration state only. No publication capability, invitation or dispatch.
24. **Recovery:** uncertain mutating response locks repeated actions until explicit saved-list refresh/reconciliation; no automatic POST retry or invented idempotency receipt. Current policy API lacks a durable command-key recovery contract. Known 403/409 is shown without claiming saved success.
25. **Acceptance:** explicit controls serialize exact backend tuple; zero/false/order/names preserved; older backend remains read-only; PR/PO remain compatible.
26. **Tests:** authored serialization/exact precision/unknown/duplicate/control boundaries/transport and mocked browser explicit defaults, retained names on failures, unknown version/read-only, uncertain-create reconciliation, stale search/company detail cases. Executed checkpoint below records the subsequent focused gates; contract fixtures are not actual backend evidence.
27. **Ownership:** UI adapter consumes existing Core/Procurement services. Backend must complete historical original-worker pins + schema readiness marker before activation; later serial TSC/unit/staged/mock+actual API browser gates required.
28. **Open decisions:** real corrected backend marker availability; module-specific SOURCING settings link if needed later; scoped branch editor/lookups; full exact numeric sample transport for otherwise unrepresentable JS numbers. Saved thresholds are exact; sample previews refuse unsafe conversion rather than change value.


## Targeted saved-name and plain-language follow-up

Visible setup messages now say sourcing rule setup is not available for the company; readiness/schema version markers remain internal. The picker uses the confirmed targeted `principalIds` contract from backend source `43aa3f7`, independently of current search/page. At most four requests resolve up to100 retained IDs. Missing/redacted/failed names never clear selected IDs or echo another person's identifier/name: labels stay generic and read-only, with explicit author removal allowed for correction. Name results are bounded to requested IDs and aborted/stale company/selection results cannot populate a new context. Current backend responses still lack the future owner-readiness marker and therefore keep sourcing mutations unavailable.

Additional authored source tests cover off-page label resolution without staff enumeration, unrequested response/paging rejection, missing/revoked scoped results, unchanged original selections, and a late targeted label response after company switching. No unit, TypeScript, build or browser job was run for this follow-up.


## Executed UI checkpoint — 21 October 2026

The parent executed the serialized verification against application source **8226f82**. TypeScript completed successfully, all **40/40** focused tests passed (`approval-settings`17, `sourcing-policy-editor`9, `procurement-scope`14), and the staged production build succeeded. These tests cover this adapter and the selected shared contracts; they are not a full ERP regression suite. The build retained the existing large-chunk advisory and introduced no deployment.

The first mocked Chromium run stopped at scenario3 after two passes: its exact `getByLabel` locator did not locate the shared textarea. The retained error context showed the expected read-only panel and accessible textbox already present. Test-only **9230507** replaced two locators with the same exact accessible textbox role, keeping readonly/value/no-action/no-write assertions. Application source and staged assets were unchanged from8226f82. The parent reran the full sourcing policy browser specification: **10/10 passed in31.8seconds, one worker, zero retries**. The initial failure/trace remains retained; it is not described as a clean first attempt.

Protected evidence directory: `/home/amizo/erp-backups/procurement-sourcing-policy-ui-20261021_083230/`.

- `verification.log`: initial type/unit/build checkpoint and first stopped browser run.
- `browser-results/`: original failure screenshot, error context and trace.
- `browser-9230507.log` and `browser-results-9230507/`: complete ten-case passing rerun.

Exact staged artifact SHA-256 values (same application candidate for both browser runs):

| Artifact | SHA-256 |
|---|---|
| `.verification-dist/index.html` | `9ec57e3fddb43661d49aad5394d77100ef71d6cb31df229605a2a4c421eb5bce` |
| `assets/index-YX6pNvLM.js` | `ba8ce95742a8c115febd4cbd9b133be2955d34f2b52c818f64cc9b55efc8d155` |
| `assets/index-Bddc462I.css` | `7f163297e91fa0e3fc3cde778b88996063082e96fb088d9866bfac750639d888` |

**Boundary:** all Procurement HTTP responses in this browser specification are contract fixtures. They demonstrate frontend rendering, serialization, guard/recovery behavior and stale-response handling against those fixtures, not real persistence, current canonical identity, historical maker-worker protection, PostgreSQL schema/readiness or policy publication. The positive `configurationVersion:1` response is explicitly synthetic; older/unversioned fixture responses remain read-only. Actual identity-aware backend lifecycle/readiness plus finite-role API/PostgreSQL and real browser integration remain required before enabling sourcing configuration. Operational RFQ publication, document pins, invitations and delivery remain unavailable and unclaimed. No live assets or backend were published by this checkpoint.
# Finite sourcing publication limits — source-only additive UI contract

This increment reuses the existing **Approval limits** tab and its Approval type dropdown. Select **Request for quotes** from the same page; there is no new settings page, navigation, approval engine or user master. PR/PO approval step settings stay unchanged.

The existing 28-section feature contract above applies, with these explicit additions:

| Sections | Additive contract |
| --- | --- |
| 1–4 Identification, purpose, scope, relationships | Configure named finite sourcing publication limits; this is not operational RFQ publication. Reuses shared spending-authority CRUD and lifecycle. |
| 5–7 Actors, entry, prerequisites | Existing current Core identity, selected company/branch and authority read/configure/review permissions; backend remains authoritative. No bootstrap permissions or inferred policy-configuration grants. |
| 8–11 Workflow, states, permission/scope, rules | Existing Draft/Submit/independent Activate/Return/Revoke/Supersede lifecycle and server `allowedActions`. Exact tuple is `SourcingEvent.Publish` / `procurement-sourcing-publish` / `ApprovedLineBase`. Mismatched tuples remain read-only. |
| 12 Data ownership | Existing Procurement-owned finite authority row and immutable history; exact maximumAmount string preserves numeric(18,4), Core owns people/currency/scope. |
| 13–14 Screens and behaviour | Existing shared controls, action-filtered list, named-person lookup and form. Plain copy states full selected approved source line amount and that configuring a limit does not turn on publication. |
| 15–17 Notifications, documents, exceptions | No new notification/document feature. Older API rejection or missing/wrong `createAction` and `createAmountBasis` disables create; no policy version marker is accepted as authority support. Unknown permission/basis is read-only. |
| 18 Integrations | Existing spending-authorities list and lookups send `action=SourcingEvent.Publish`; create explicitly sends action, update preserves original row action and identity. No publication command or financial posting is added. |
| 19–22 Audit, reports, configuration, nonfunctional | Existing scoped server audit/read projections and accessibility/reusable ERP controls. No new report, schema or runtime flag. API capability remains separate from UI knowledge of the tuple. |
| 23–24 Postconditions and recovery | Draft alone grants no authority. Exact returned action/permission/basis must match; unconfirmed results keep existing reconciliation UI and never automatically retry create/update. |
| 25–26 Acceptance and tests | Authored four focused client tests for exact query/metadata/money/tuple/replay boundaries and four browser contract cases for create/edit/older API/unknown basis. Existing PR/PO cases retained. These new tests have **not been executed** in this increment. |
| 27–28 Dependencies and open decisions | Backend author confirmed exact existing DTO contract. Server lifecycle and independent identity controls remain its responsibility. Operational publication, assigned review and execution readiness are outside this UI increment and remain disabled. |

Source validation: `git diff --check` only. No Node/TypeScript/build/browser/API/database jobs, generated assets or deployment were performed for this increment. The earlier executed checkpoint belongs to the prior application candidate and must not be presented as verification of these changes.
