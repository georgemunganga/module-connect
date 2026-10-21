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
