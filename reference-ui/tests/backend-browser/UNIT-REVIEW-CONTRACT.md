# Actual P23 original-unit UI acceptance (source only)

Uses the existing staged UI and `playwright.backend.config.ts`, one worker, zero retries. Start no
backend from this test: root first verifies genuine P23 SQL/readiness, freezes the complete tool
publication, and runs the finite private runner `--mode unit-reviews --browser`. Its protected
manifest must declare `fixtureKind=invoice-unit-review-v1`, fixed Unix transport/no TCP, actual
workerless Core actors, original references, no review effects and synthetic-known-bytes scanner.

Set the existing `PROCUREMENT_APPROVAL_BROWSER_MANIFEST` and `PROCUREMENT_APPROVAL_BROWSER_SOCKET`
to that new private fixture. The existing private Unix request bridge forwards all real Procurement
requests and responses. Only ERP shell presentation and outer fixture identity are synthetic;
current Core grants, scope, workflows, persistence and document-use authorization remain real.

The browser opens the review via existing bill detail, proves no maker decision, checks unassigned,
revoked and wrong-branch denial, uses the real reviewer queue/detail and pinned document download,
checks downloaded bytes, requires explicit attestation, decides once and replays/recovers the exact
actor-owned receipts. Reload remains terminal. Traffic is retained in a0600 file. No real ClamD,
production authentication, Finance matching qualification, AP or payments are certified.

After Playwright is terminal, stop only the exact private fixture so its mandatory fresh owning
completion reloads real Core/source3/outcome3/wire1/document pins and receipt counts. Completion is DB-only after the listener stops. During preparation a separate actual Core actor
is checked with its grant (tasks200), its stored action is revoked, then tasks403 and unchanged
review effects are checked. The manifest must mark `revocationVerifiedBeforeBrowser=true`; the
browser also checks this revoked actor is denied. The named reviewer stays granted for the UI.
No mid-browser or post-browser revocation is claimed. Preserve failures; do not retry or create replacement records.

This test is authored only. No Node, browser, SDK, PostgreSQL or scanner job was run during authoring.

Target only this fixture-compatible spec, after the separate staged build:

```sh
./node_modules/.bin/playwright test tests/backend-browser/unit-reviews.spec.ts --config playwright.backend.config.ts --workers=1 --retries=0 --max-failures=1
```

Passing and failing traces are retained. They supplement, rather than replace, the source-bound
publication manifest and fresh owning completion proof.
