# Shared table standard

Procurement uses the ERP list pattern on every on-screen table. The table surface owns header typography, row spacing, separators, hover feedback, and theme colors. Each page still owns its columns, filters, permissions, actions, selection, paging, and business rules.

- The workspace `StandardDataTable` is the full directory table used by transaction lists. `RecordList` keeps the toolbar, status views, pagination, and workflow actions.
- The workspace `RecordTable` wraps tables in settings, catalogs, details, sourcing, payables, analytics, and import screens. Use `variant="compact"` for dense previews or editor tables.
- The connected frontend uses `ListPage` for ordinary directories and its own `RecordTable` for specialized lists. Its base table primitive shares the same visual surface.
- Wide tables stay inside an `overflow-x-auto` container. The page itself should not scroll horizontally on a phone.
- Standalone printed documents can keep print-specific table styles. Interactive grids keep their cell controls and can use the `matrix` variant when cell sizing is deliberate.
