# Shared Procurement UI baseline — 21 October 2026

## Source boundary

Ordinary merge of existing UI `f3fdb10` into `main` (`57c9703`), preserving both histories and the existing application. The application remains in `reference-ui/`; API clients remain in `src/platform/`. No re-import, replacement frontend, backend migration or activation of P20–P29 is included.

The user correctly identified a live layout regression. Original reference `Greenwebb/zoho-procurement-ui` at `6f0c305` and the imported `CatalogDetail.tsx` retain the vendor directory, record toolbar, five tabs and split overview. Live routing bypassed them through the simplified `LiveVendors.tsx`.

This change restores that detail presentation using a presentation-only frame and existing ERP controls. Actual vendor IDs, company-scoped directory/search/pagination, real API actions and optimistic versions remain authoritative. Scope/record changes clear old reads; late mutation completions cannot navigate to an old record. Workerless administrators remain read-only. Unknown/demo IDs never fall back to browser-local suppliers.

## Remaining original UI parity

This is not complete original-feature parity. The full seven-tab vendor editor remains a Manus milestone. New Transaction/More menus, email, comments, statements, Finance balances/banking and activity require owning contracts and permission-aware integration; they are not simulated. Unavailable tab data is labelled clearly.

Settings require a separate bounded milestone: restore the existing settings index/shell, gate each child by its supported contract, and keep global organisation/branding/identity in Core. Do not broadly enable browser-preview save handlers as persisted configuration.

## Verification

- Unit discovery excludes both Playwright directories; the initial Vitest run wrongly discovered backend-browser specifications. Corrected run: 44 unit tests pass.
- Vendor API client tests: 3 pass, using Node 22 with a temporary extension resolver for the existing extensionless TypeScript import. The initial plain Node command failed module resolution; it did not execute business tests.
- Live-mode staged build: TypeScript and Vite pass. Existing bundle-size warning remains.
- Browser evidence: Chromium, one worker, no retries, synthetic mocked ERP HTTP fixtures. Covers supported vendor create/refresh/edit/withdraw, contacts/sites/qualifications, review/hold/reactivation, denied/admin paths, original detail geometry/URL tabs, directory switching, unknown IDs and delayed company switches.
- Initial browser run: 19 pass, 5 fail due to newly ambiguous contact/status selectors. Assertions now target contact list entries and the record header. Initial failures retained in `artifacts/shared-baseline/browser.log`.
- These browser cases do not prove production database persistence or a real authenticated user session. No production record writes are used.

Final application source: `24e7bc9428c7374f0c043751ed03b210af75ec46`. All 24 scenarios passed before the final sticky-header adjustment. After that adjustment, 23 passed and one new scroll assertion had an ambiguous nested-header locator; the selector was corrected to the direct record header. All five layout/isolation scenarios then passed, including desktop/mobile screenshots and scroll overlap. No scenarios were removed or retried automatically. The application assets are unchanged by that final test-only selector correction. Desktop and mobile screenshots were inspected.

Evidence: local `artifacts/shared-baseline/` and protected release folder `/home/amizo/erp-backups/procurement-vendor-layout-24e7bc9/`. Intermediate logs and the last failed assertion trace remain retained. The first browser run's detailed failure log is preserved, but its test-results folder was overwritten by the next run; do not claim every initial trace survived.

The backend remains the verified P19-compatible administrator-access release. UI publication is a separate operation after this source merge, with previous assets preserved and public asset hashes checked.
