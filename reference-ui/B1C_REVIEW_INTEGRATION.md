# Commercial round-plan review UI integration

Backend prerequisite: published ERP main `7166e36232fb464a005dc5cbea9e1eef1ebd4848` / executable source `9fecef1732b7629f5ac8dbd005c863d20898a250`. UI baseline: `ef42580fa53b5ef74c1b63d3f81d5302597f9bc1`.

This draft preserves the imported RFQ panel, its existing tabs and shared ERP controls. It adds scoped submit/review APIs, a separate original-command recovery journal, assigned review tasks in Approvals, immutable submitted evidence, and the existing policy-settings lifecycle with the purpose-specific Core reviewer lookup. Submission requires both a current server action hint and an actual applicable policy pin. Review approval means an internal approved plan; supplier RFQ publication remains blocked for enrolled events.

Verification: 40 focused Vitest checks passed across the existing round-plan adapter, policy dispatch and five new review/recovery cases. The initial full TypeScript check passed; the repeat including the new test file is tracked separately. These tests mock HTTP and do not establish real API or browser persistence.

Remaining: independent review of the entire UI change, additional policy-editor/component states, production build and preserved-layout Playwright checks, actual finite-role/runtime readiness and normal-cookie Return → edit/resubmit → Approve with native reconciliation. Backend readiness capture remains incomplete and defaults stay disabled; no UI or backend deployment is implied. Whole-module ERP issue145 remains NOT READY. No new dependencies or generated replacement layout were introduced.
