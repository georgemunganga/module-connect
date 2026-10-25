# Contract cancellation response safety

Source baseline: canonical UI `10ea1d5f9d6e128b4b36636bab02ab913c20adbf`. Existing imported contract list/detail/editor/rate and internal-review arrangement is preserved; only action state and feedback change.

`POST /api/procurement/v1/contracts/{id}/cancel` already requires current contract edit authority, own Draft record, current version and reason. It returns saved Cancelled detail. It has no original-command-key receipt or recovery GET; this change does not add or simulate one.

The detail handler blocks re-entry synchronously and captures the mounted auth/company/branch/record scope. Late responses after unmount or scope change cannot update UI or navigate. Network/5xx/malformed or mismatched acknowledgements lock further cancellation, editing, rates and new review submission in this detail. Definite409 also locks until saved state is inspected. Definite validation rejection allows correcting the retained reason.

“Refresh saved contract” issues ONLY the existing scoped detail GET. It never repeats POST. A returned terminal record removes draft actions. If an unknown result still reads Draft, the original cancellation remains unconfirmed and the in-page write lock stays. An explicit fresh GET after409 permits comparison against current saved version. Failed GET leaves the lock. This is saved-state inspection, not original receipt recovery; no persisted command journal is invented for an unkeyed API.

Eight focused mocked Playwright cases are authored: committed cancellation/lost acknowledgement, malformed acknowledgement, still-Draft GET, late successful response after navigation, normal current-version cancellation, correctable422, stale409 followed by GET, and failed403 GET that retains the write lock. They reuse the existing ERP/API fixture and retain all response validation. No Node/TypeScript/browser job has run on this branch yet. These mocks do not certify real API persistence, normal-cookie behavior or production deployment.
