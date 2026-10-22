# Governed Procurement UI verification checkpoint

22 October 2026. Source candidate only; no production deployment or real API acceptance is claimed.

Application source through `51c7498` built in live mode with Node 22 and `--max-old-space-size=768`. TypeScript passed; the staged build generated 112 canonical routes and assets `index-B_6EFR2t.js` (SHA-256 `a5814500e3772fceb9a078c923bc43f603d8afea17e906775b1643965259c85c`) and `index-DRFL7qas.css` (SHA-256 `8cbe70ac1dea2815e12417c70de5b9939324ded9f04219d4a78237609ca69f16`). Focused unit tests passed 32/32: exact request draft 8, receiving contract 9, order money and evidence selection 15.

Mocked browser tests passed 76/76, sequentially with one worker and zero retries: requests 18, receiving 18, governed order sources/execution/approvals 34, retained draft order workflow 6. The first order approval run failed on a strict Playwright locator because the saved decision and a concurrent loading indicator both had `role=status`. The test now selects the saved decision status explicitly (`8255e94`); the initial failure trace remains in ignored local artifacts. Application bytes did not change after the staged build.

These tests use mocked HTTP contracts. Real API and private database browser acceptance, including the new explicit current Finance/issued evidence pointers, remains required before enabling governed order actions or deploying the combined release. This checkpoint does not assert Finance postings, payments, inventory balances, employee authority or approved business policy.
