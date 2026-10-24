# @acunsoft/datatable-server

## 0.4.0

### Minor Changes

- fc415f6: New package: the Node back end for Next.js route handlers, Express and
  Fastify. `defineColumns` (the allowlist), `readTableQuery` (this format or
  DataTables' protocol, checked and typed), `sqlQuery` (bound-parameter SQL
  for PostgreSQL, MySQL, MariaDB, SQLite and SQL Server with filters, smart
  search, sorting, OFFSET or index-friendly cursor paging; NULL-aware with
  `nullable` columns), `prismaQuery`, `tableResponse` and `tableError`. No
  database driver is a dependency: SQL Server users add `mssql`, the others
  their own driver; `MAX_BINDINGS` keeps SQL Server within 2,100 parameters.

### Patch Changes

- Updated dependencies [b758334]
- Updated dependencies [5753f1f]
- Updated dependencies [4eeae3d]
- Updated dependencies [71e021a]
- Updated dependencies [b55e381]
- Updated dependencies [f3b749f]
- Updated dependencies [ade0663]
  - @acunsoft/datatable-core@0.4.0
