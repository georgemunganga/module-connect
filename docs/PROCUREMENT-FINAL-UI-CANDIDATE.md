# Procurement integrated UI candidate

Status: source integration only. Not deployed; combined TypeScript/build/browser gates pending.
Worktree: `/home/amizo/procurement-final-ui-integration`
Branch: `codex/procurement-final-ui-integration`

## Source provenance

- Base `cebd813`: scoped PO execution worklists/details, approved-source conversion,
  linked editing, evidence/recovery, shared PR/PO decision dialog and assigned PO decisions.
- `57eb3f8` + `e1fe363`: preserve explicit buying-method routes; stable shared-select
  accessible name; unsupported routes stay read only; omitted nondefault route response
  cannot falsely confirm a save.
- `b9af82f` + `0339522`: exact PR approval settings and named/scoped finite spending limits,
  policy editor/unknown-config protections, StrictMode liveness correction.
- `7fda4f2` + `5518f01`: typed PR/PO approval setup contracts, action-filtered people/limits,
  supported PO policy model, fresh-response unit fixture correction and source-gate evidence.
- `5ab07ab`: real-API authority-settings browser scenario. It requires a separate synthetic,
  protected-manifest sandbox and never fabricates Procurement responses.

These increments are additive cherry-picks. Tenant branding, shared controls, navigation
structure, prior actual-API approval tests and prior module functionality remain in the tree.

## Integration decisions

- Gate configuration paths include both PR and PO approval settings, using the existing
  `configurationDraft` readiness flag. This does not enable order execution.
- Operational orders use `orderDraft || orders` at the outer gate; each page selects its
  adapter using the actual `orders` capability. Legacy draft buying remains available when
  execution is false. With execution enabled, create/edit keeps approved source bindings.
- The Approvals entry accepts either verified approval capability; typed PO-only actors do
  not require PR permissions. PR-only denial retains the established request-queue behavior,
  permission checks, wording and no-fetch behavior.
- Shared decision UI is presentation only. PR and PO adapters retain separate DTO validation,
  endpoint paths and version pins. Backend Core remains the approval engine.
- Exact financial strings are preserved. Unknown policies, unmapped assignees and unsupported
  method routes are not silently replaced with working-looking settings.
- No source in this candidate activates backend capability flags or changes production roles.

## Recorded predecessor evidence and remaining gates

Predecessor checks are evidence for their exact sources, not combined acceptance:

- PO `24eedaa`: 13 exact-payload unit tests and TypeScript passed.
- Authority `5518f01`: 17 settings/policy unit tests and TypeScript passed.
- Method `e1fe363`: staged live build/TypeScript and eight mocked configuration browser cases passed.
- PR settings `0339522`: focused real Vite StrictMode two-case gate passed, with mocked APIs.

After resource clearance, verify the integrated source:

1. Focused exact-order and approval-settings unit tests; TypeScript.
2. One live staged production build; freeze and hash its assets.
3. Single-worker focused browser suites on those exact assets: PO execution, sources and
   assigned approvals; legacy order drafts; existing PR approvals. Also cover settings,
   policy and method adapters because these were integrated into the same candidate.
4. Actual authority-settings browser test on the same frozen assets against the separately
   approved fresh restricted-runtime synthetic sandbox. Existing real approval tests are
   retained; their execution requires fresh matching fixture requests and operator clearance.
5. Root-owned release review and capability decision. No deployment follows from this file.

Preserve first failure logs/traces. Fix actual contract/type defects and record any changed
source/build hash. Do not run extra SDK jobs, start databases, alter restored-data permissions,
serve a restored database or overwrite public assets during this verification.

## First combined browser gate and correction

The first frozen `613ae83` / `index-COjxy97z.js` gate passed 17 cases, including all
14 existing PR approval regressions, then stopped on the authority stale-review case.
The trace showed the expected activation 409 followed by successful authoritative list
refresh; the obsolete action was removed. The list loading effect also cleared the
command conflict message, leaving no explanation for the user. No timeout/assertion
change was made. The correction retains command failure separately from list errors,
clearing it on explicit new action/filter/page/refresh acknowledgement. The existing
stale-review browser scenario remains the regression test.

Original first-run trace, screenshot, context, logs and five original candidate files
are retained under `/home/amizo/erp-backups/procurement-final-ui-20261020/`. The static
preview/browser exited before source changes; corrected source requires TypeScript and
a new frozen staged build before browser continuation. This is not deployment evidence.

The corrected `5896c2f` / `index-D-b3C2fm.js` build passed the failed authority
regression, then all seven authority and eight method configuration cases. The next
PO rejection case stopped before POST because its new exact-name test locator omitted
the shared Field help text: actual accessible textbox name is `Reason Explain what
needs to change.`. Only that PO test selector is corrected; required-reason assertions,
control behavior, timeout and all application source/assets remain unchanged. Original
trace/screenshot/context are retained. Root authorised retaining the exact staged build
and the 14 PR plus 15 authority/method checkpoints while rerunning the PO and remaining
policy suites. Aggregate coverage must not be described as one uninterrupted green run.

The subsequent unchanged-application run passed all eight assigned-order scenarios and
eight order execution scenarios before the new both-capabilities-disabled test expected
the wrong fallback copy. The real application supplies `PendingLiveWorkflow` through
its shared unavailable route and correctly showed `no sample transactions are shown
here`, with no order API reads/actions. That test now checks the actual shared pending
message plus zero reads/writes and no order review/create controls. Application source
and staged hashes remain unchanged; previous successful unique cases remain checkpoints.
Root authorised only the failed case and 29 not-yet-run scenarios to continue.
