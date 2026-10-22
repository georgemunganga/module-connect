# Selected organisation display for Procurement-only users

Status: source implementation and test cases prepared; compilation/browser execution pending the shared CPU slot. This change is separate from the verified `36127ad` release bundle.

## Existing Core boundary

Core organisation lists currently use HRM's default staff admission policy. `ConfigAdminServiceImpl.ListLegalEntitiesAsync` additionally requires `erp_admin`, `hr_ops` or `hr_admin`; location listing also uses named HRM roles. A custom Procurement role with valid action grants therefore can use Procurement but receive HTTP 403 from those Core list endpoints. The existing shell's combined lookup then hides company/branch choices and incorrectly asks an already authenticated user to sign in.

This change grants no additional Core permissions and adds no organisation master, list endpoint or duplicate company configuration.

## Display-only fallback

The existing full switcher stays backed by the existing Core lists. When at least one Core organisation lookup explicitly returns HTTP 403 and other lookup failures are also 403, the shell may read the existing Procurement context endpoint using the captured company and branch headers, current ERP credentials and `no-store`.

Only a response with a real principal ID, valid tenant/company/currency, the Procurement access grant and exact matching selected company/branch can supply display names. The projection contains only that company and selected branch. It is kept separate from the full-choice arrays and renders as read-only current workspace information. No company button can clear a confined branch; `allowedCompanies` is not promoted into a master list or switch choices.

If no branch is selected, the server's verified default branch may be shown. Organisation-unit-only selections without a selected work-location response remain unavailable in this fallback rather than displaying a guessed branch.

Denied, malformed, foreign or failed context reads show no fallback names. Authentication generation and selected scope are captured; render-time key comparison, abort and completion checks prevent a late prior-account or prior-branch response from restoring stale names. Logout invalidation clears the projection. The unavailable menu uses neutral wording instead of claiming the user needs to sign in.

## Authored verification

- Unit tests: selected-only projection, optional employee independence, malformed/foreign contexts, captured headers/no-store, failed responses and invalid selected IDs.
- Browser tests: custom Procurement role with denied Core list access sees actual selected names and no switch action; extra context companies do not become choices; invalid/denied context remains unavailable; Core-authorized full choices remain; late prior-authentication response cannot restore old display.
- Existing Core list authority and all Procurement record permissions remain authoritative. No backend or production changes were made.
