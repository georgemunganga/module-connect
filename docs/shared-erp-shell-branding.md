# Shared ERP shell and company branding

Procurement's workspace reads the current company identity from `GET /api/hrm/branding`, the public endpoint already used by HRM. Its logo, favicon, name and color tokens now come from that record. The Procurement Settings → Branding page links to `/hrm/configuration/branding`, which is the current editor. Procurement must not create a second company branding record.

The Procurement header reads the same `erp.shell.state.v1` entity and branch selection as HRM. When the signed-in user has access, it loads permitted entities and locations from the existing HRM API. The backend remains responsible for validating scopes. The cloned Procurement workspace still uses browser-local demo records, so changing this context does not filter those records; the selector says so explicitly.

## Platform consolidation

The branding and organization endpoints currently live under HRM because that is where they were built first. Before connecting Procurement to real transaction data, move ownership to shared ERP Core and expose a common shell package/API for all modules. Preserve the current HRM routes as compatibility adapters during migration. That shared service should own company branding, legal entities, branches, authorized context selection, and module navigation. Each module should own only its module-specific settings and records.

For future Procurement API calls, use the selected stable entity and branch IDs, and enforce their permissions on the server. Never use the browser selection alone as authorization.
