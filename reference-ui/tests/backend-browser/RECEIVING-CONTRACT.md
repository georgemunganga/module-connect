# Actual receiving browser contract

Source-only checkpoint. This is authored coverage, not a passing browser or production claim.

Frontend base: `375861d`. Backend fixture: `5acc2e4` (`--serve --receiving`), with later root mapping corrections required before execution. The test changes no application source. Reuse the exact staged receiving candidate after its TypeScript/build gate; this test starts only the existing static preview, never the backend or a database.

## Operator sequence

1. Root provisions a new disposable `proc_approval_http_*` database, matching migrations, distinct restricted runtime role and actual loopback Kestrel fixture. Set `PROCUREMENT_RECEIVING_BROWSER_VERIFY_ON_STOP=1` when starting `--serve --receiving`. Never reuse a partially executed fixture.
2. Root confirms the new owner-private manifest and server readiness. Set `PROCUREMENT_APPROVAL_BROWSER_MANIFEST` to that manifest. It contains synthetic scoped actor/context/source references and no passwords/tokens.
3. In `reference-ui`, with Node22.23.3, run only:

   ```sh
   NODE_OPTIONS=--max-old-space-size=512 nice -n 10 ./node_modules/.bin/playwright test --config playwright.backend.config.ts tests/backend-browser/receiving.spec.ts --workers=1 --reporter=list
   ```

   The existing configuration uses an already built `.verification-dist` preview on loopback3011,180-second case timeout,30-second UI expectations and45-second transport requests. No timeout broadening or backend build is included. Preserve the original candidate hash and first failure artifacts.
4. Capture terminal result and `actual-receiving-api-traffic.json` (materialized0600, including browser and direct verification calls). Notify root when no further calls will run. Root gracefully stops the server to run independent owner-side persisted checks. Browser success alone does not replace those checks.

## Coverage and invariants

- Real seeded approved/funded/issued goods/service source authority; no receiving effects seeded.
- Physical goods2 against authorized1, qualification2 by named inspector, independent acceptance1, held1; no invented acceptance of the excess.
- Receiver, named inspector, independent acceptor and named service owner are different actual identities. Purpose actors have no broad receipt/PO read. Actual full-detail403, unnamed task404 and empty queues are asserted; purpose responses omit private notes/documents.
- Two independently drafted0.5 service certificates at exact net50 each. Second pending detail retains null persisted ledger link while reporting current nonzero shared sourceCAS; command uses that exact detail version. First1500-character notes survive certification, separately from cancellation reason.
- Eight real UI commands, eight unique UUID keys, actor order and source/version/body pins asserted. Exact goods-accept replay returns the original response and does not add an effect. No automatic POST retry and no Procurement response mocking.
- Root's graceful verifier checks one goods header/line/inspection, goods source sequence3 and accepted1/net100, two service certificates/source sequence2 and cumulative1/net100, independent worker attribution, PR/PO accepted counters, eight command/audit records and five outbox effects. It also checks no invoice/AP records were created.
- Broad `receiving` capability remains false while granular receiving capabilities gate the actual UI. No matching/AP authorization is fabricated.

Only ERP shell authentication/branding/organization presentation is synthetic. Procurement context, metadata, sources, queues, reads, commands, authorization failures, replay and persisted effects use the real API. Actor-specific fixture headers are a test-only authentication bridge, not production authentication.
