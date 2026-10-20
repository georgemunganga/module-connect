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
