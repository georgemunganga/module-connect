# Original bill unit review policy UI

Status: source implementation, pending serialized TypeScript, unit, build and browser verification. No deployment or actual P23 workflow completion is claimed.

Backend source contract reviewed: ERP `8a89ba6` in `codex/procurement-unit-review-core-principal`. UI baseline: `f33a631`, retaining the established shared ERP controls and existing vendor/Procurement UI.

## Ownership and route

Bills → Settings → Preferences now has two inner tabs: **Invoice matching** (existing editor) and **Bill review rules** (`?rule=unit-review`). `INVOICE_UNIT_REVIEW` policy links select the latter. There is no new module, sidebar entry, Core user master or employee dependency.

The typed review policy is the existing schema 1 `InvoiceUnitReview` document with ordered `stages`, each containing `code`, explicit `mode: One|All`, and canonical Core `principals`. An empty unfinished draft is allowed. No stage, decision strategy or reviewer is silently selected. Sending for review requires a complete saved definition; backend validation rechecks current identities and permissions. Unsupported saved fields/formats remain read-only.

The reviewer selector calls only the actual bounded `configuration/policies/lookups/invoice-unit-reviewers` contract. It displays actual Core names and eligibility hints; `canReviewOriginalUnits` never grants access. Employee IDs are not required or fabricated. Saved identities whose names are not in the current bounded search remain explicitly selected as “Saved reviewer”; opening an editor never drops or replaces them.

## Workflow and access

The UI reuses owning policy list/detail, validate, create, versioned update, submit-review, publish and return APIs. Only actual server permissions enable configuration reads/edits/approval actions; role names do not create authority. A successful effective-policy read confirms the required schema is available even if no policy is published; unavailable schema permits read-only inspection. Execution capability remains independent from policy configuration.

Publishing requires the server's current permission, independent-actor and policy-version checks. Current policy DTOs do not expose original creator identity, so the UI does not invent creator information or claim to establish independence. Rejected publication remains pending and cannot be automatically repeated.

A session marker scoped to tenant/company/branch/Core principal/policy key is persisted before a consequential command. Failed storage prevents the write. Only a validated persisted response or definite pre-write 400/422 clears it. Unknown/malformed responses and unrecognized statuses, including 408/429/499, retain it across reload/context changes. No unmount or context switch clears another actor's marker.

## Existing review commands

Original review owner/tasks already use the real Core `principalId` and optional employee projection. Mocked review journeys now explicitly use `workerId: null`. Historical command receipt **wire schema remains 1** with existing invoice/review/key, decision/outcome/state combinations and exact CAS checks. Internal retained source identity schema 3 and outcome evidence schema 3 are separate backend contracts, not substituted for the wire receipt version. No absent owner/source metadata is fabricated. Backend owns source/actor/evidence verification.

Pending-command clearing additionally requires the same invoice and review IDs. The actual already-opened blocker code is recognized. No business authorization or receipt validation was weakened.

## Verification authored

- Strict codec tests: empty drafts, canonical principals, malformed/duplicate fields, unknown schema fields, limits, real UTC dates.
- Actual contract parser tests: bounded Core reviewer names/eligibility, missing/malformed fields, owner validation flags.
- Journal tests: wrong invoice/review/key cannot unlock; another principal/company/branch cannot clear the marker.
- Mocked browser cases: system-only reader/editor, existing matching tab, named reviewer create/reload/edit/submit, publish/return, unavailable schema, unknown 408/429/499, malformed persisted receipt, rejected storage, unfinished draft, server self-publication denial.
- Existing unit-review browser journeys retain their receipt/CAS/document tests with workerless system principals.

These tests are authored, not executed proof. Actual PostgreSQL P23 installation, system-only Core review execution, deployment and production smoke checks remain separate release gates owned by ERP.

## Alignment after current UI main

The isolated policy branch merges published UI main `63054fc` without replacing shared components or current application styling. Current P22 release remains separate from this future P23 source branch.

The API decoder recognizes the actual additive `makerPrincipalId`, `identitySchemaVersion` and `evidenceSchemaVersion` fields. A supplied maker is a canonical real Core identifier, independent of optional HR linkage. This new P23 route supplies retained source identity3, distinct from receipt wire1 and terminal evidence3. The separately retained legacy identity2 consumer is not treated as a new-route source. Pending receipt evidence may be omitted by the backend's null serializer or supplied as null. Older wire1 without additive metadata remains readable; partial or malformed supplied metadata does not confirm an action.

When the UI already knows the source maker/version, a decision receipt or recovered command must agree before its pending marker can clear. Opening receipts/recovery that supply maker metadata must match the actual current Core principal. Unknown outcomes remain blocked across reload; no second POST is issued merely because metadata was malformed. This is response consistency, not frontend authority. Existing server permissions, scope, document pins, exact CAS and actor-owned recovery remain required independently.

Newly authored verification covers canonical current source identity3, rejecting a legacy2 source substituted into this new route, partial/invalid metadata, pending/terminal evidence combinations, wrong-maker/source receipts, missing known receipt metadata, old wire1 compatibility and rejecting wire3 substitutions. A new mocked browser case retains the interrupted open through reload and conflicting GET recovery without a second POST; the existing workerless purpose-reviewer case now includes the actual additive metadata. These additions, including TypeScript/build/browser checks, have **not run** while the current release owns the CPU slot.

Backend source contract checked against `b6d62c7` on `codex/procurement-unit-review-core-principal`: the new four-table review route strictly retains source3, terminal evidence3 and receipt envelope1. Its separate legacy2 consumer does not make a source2 response valid for this new route. Seventeen focused API unit cases and one additional mocked browser scenario are authored for this alignment, with the existing workerless happy path updated to actual metadata. All remain unexecuted source evidence pending a scheduled UI gate.
