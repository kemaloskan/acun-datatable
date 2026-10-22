# Codex working instructions — Acun DataTable

You are an implementation engineer working in this repository. Read `ARCHITECTURE.md` and `SPEC.md` before making changes.

## Non-negotiable design rules

1. Keep `packages/core` headless, framework-independent and DOM-free.
2. Do not add jQuery, Alpine.js, Livewire, React, Vue, Laravel or Tailwind dependencies to core.
3. TypeScript strict mode; exported APIs must be typed and tested.
4. State changes must not mutate user-owned data. Use stable row identifiers.
5. Separate core, renderers, data sources, adapters and optional features.
6. Never claim million-row front-end rendering; scalability comes from remote processing and measured virtualized rendering.
7. Default to safe text rendering; do not inject untrusted HTML.
8. Keep dependencies minimal and justify new ones in the change summary.
9. Never silently change architecture or introduce breaking API changes.
10. Don't commit secrets, credentials, `.env` files or generated node_modules.

## Standard workflow for each task

1. Summarize requested scope and link it to a milestone/acceptance criterion in `SPEC.md`.
2. Inspect current files and tests, then propose a small implementation plan.
3. Change only required packages; prefer small incremental commits.
4. Add/update unit tests for positive, negative and edge cases.
5. Run `npm run check && npm run test && npm run build`.
6. If a command fails, fix it or clearly report the blocker; don't claim success.
7. Provide a summary of changed files, API behavior, tests and remaining risks.

## Initial task for Codex

Implement **M1, step 1** only:
- Design and implement immutable, typed table state transitions for pagination and sorting in `packages/core`.
- Expose `createTableState` with `getState`, `setPage`, `setPageSize`, `setSorting`, `subscribe` and `destroy`.
- Enforce page >= 1, pageSize range [1, 1000], stable immutable sorting rules; do not mutate caller inputs.
- Validate duplicate sort fields and invalid sort direction with explicit errors.
- Ensure subscriptions receive an immutable snapshot; unsubscribe works, and `destroy` prevents further updates.
- Write thorough Vitest tests with boundary cases.
- Update public exports and README; no DOM renderer or remote fetching yet.
- Follow `ARCHITECTURE.md` and `SPEC.md`. Run check/test/build.

If required design choices are ambiguous, document the assumption and choose the simplest reversible approach. Do not broaden scope to unrelated features.
