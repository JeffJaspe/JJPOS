# Progress

## Phase 1 — Foundation ✅ (Jun 12, 2026)

Scaffolded the app from scratch and verified it end-to-end (`npm run dev` boots, login works, shell renders).

### What's in place

- **Stack**: Electron 41 + Vue 3 + Vite (electron-vite 5) + Tailwind CSS 4 + Pinia + TypeScript everywhere. Typecheck: `npm run typecheck`.
- **Database**: better-sqlite3 in the main process only; DB at `userData/data/pos.db` (WAL, foreign keys on). Migration runner applies numbered `.sql` files from `electron/db/migrations/` (bundled at build time via Vite raw imports — just add a new numbered file).
- **Schema**: full core schema from PLAN.md §4 created in `001_init.sql` (auth/roles, branding, settings, masterfiles, sales, stock_movements, ledger, audit_log) so later phases only add deltas.
- **IPC**: `contextBridge` API (`window.api`) with an `IpcResult` envelope — handler errors cross the bridge as clean messages. Session lives in the main process; `requireAuth`/`requirePermission` guards ready for all future handlers.
- **Auth**: bcrypt login, audit-logged login/logout, seeded roles (Super admin locked, Supervisor admin, Cashier, Report account) with menus + permissions per role. First launch seeds `admin` / `admin123`.
- **Shell**: collapsible sidebar (role_menus-driven, animated, state persisted), branding-driven app name/logo/accent color, top bar with page title + user/role, router guards (auth + menu visibility), page transitions, toast system.

### Decisions made (flag if you disagree)

1. **Money is stored as INTEGER centavos** (₱1,234.56 → `123456`) — avoids float rounding errors in totals/ledger. Renderer formats for display.
2. **Timestamps are ISO 8601 UTC** (SQLite `datetime('now')`); renderer converts to local time for display.
3. **Electron pinned to v41** — better-sqlite3 doesn't ship prebuilt binaries for Electron 42 yet, and v41 installs with zero build tooling (no Python/VS required). Bump when prebuilds appear.
4. **bcryptjs** (pure JS) instead of native bcrypt — same algorithm, no second native module to rebuild.
5. `shared/types.ts` added (not in PLAN structure) as the single source of truth for the IPC contract between main and renderer.

### Pending

- Default admin password must be changeable once user management lands (Phase 6).
- `qty_on_hand` cache column exists on items; movements remain the source of truth (PLAN §4).

### Next: Phase 2 — Masterfiles

Items CRUD with barcode assignment/generation + label printing; Customers, categories, suppliers CRUD.
