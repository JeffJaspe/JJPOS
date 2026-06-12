# Progress

## Phase 2 — Masterfiles ✅ (Jun 12, 2026)

Items, Customers, Categories, and Suppliers CRUD, with barcode assignment/generation and label printing. Verified end-to-end by driving the real UI over the Chrome DevTools Protocol (login → create item → generate barcode → save → edit → labels → category/supplier → customer).

### What's in place

- **Items**: searchable/filterable list (name, SKU, exact barcode), create/edit modal with all PLAN fields, soft-delete via active flag, low-stock highlight (qty ≤ reorder level).
- **Barcodes**: multiple per item; scan-to-assign input; auto-generated internal EAN-13 (`2` in-store prefix + 11-digit sequence from `settings.barcode_sequence` + check digit, `shared/barcode.ts`); cross-item uniqueness enforced with friendly errors.
- **Label printing**: per-item modal (barcode picker, copies), jsbarcode SVG (EAN-13/Code 128 auto-pick), 50×30 mm labels in a print-only area (`window.print()`).
- **Customers**: CRUD with credit limit, terms (COD/7/15/30), TIN; **opening balance posts an `adj` ledger entry at creation** so Phase 5 derives balances purely from `ledger_entries`; the field is read-only after creation.
- **Categories/Suppliers**: inline panels under Items tabs. Category delete blocked by FK if items use it; suppliers soft-delete only (Phase 4 receiving will reference them).
- **IPC**: `items`, `customers`, `categories`, `suppliers` domains; writes gated by `edit_items` / **`edit_customers` (new perm, migration 002)**; UNIQUE-constraint errors mapped to actionable messages.

### Bugs found & fixed during verification

1. **Route transitions froze when window occluded** — Chromium throttles rAF for backgrounded windows, so `<Transition mode="out-in">` never finished and views never mounted. Fixed with `backgroundThrottling: false` (right call for a POS terminal anyway).
2. **Reactive Proxy can't cross contextBridge** — sending `form.barcodes` (Vue reactive array) threw "An object could not be cloned"; plain-copy before IPC.
3. Removed default Electron menu (`Menu.setApplicationMenu(null)`) — kiosk app; Alt accelerator interfered with keyboard-first flows.

### Label printing rework (Jun 13, 2026)

The first label implementation printed the app window itself (the modal is teleported to `<body>`, so the hide-the-app print CSS missed it) and had no preview. Replaced with a proper pipeline:

- Renderer builds a **self-contained HTML document** per job: `@page { size: <W>mm <H>mm; margin: 0 }`, one label per page — what dedicated label printer drivers (Zebra/TSC-style) expect. Label W/H configurable in the modal (default 50×30 mm, persisted per terminal).
- Main process renders it in a **hidden BrowserWindow**: `print:html` sends to a printer through the **system print dialog** (pick the barcode printer; cancel returns false, not an error), `print:previewPdf` returns the exact paginated PDF (verified MediaBox 50×30 mm).
- In-modal **live preview** uses the same document via iframe `srcdoc` (same engine that prints = faithful), with page outlines. Chromium's PDF viewer can't render blob/data PDFs in iframes, so the PDF path is print/export-only.
- Barcode SVGs are serialized with a `viewBox` (scalable) instead of fixed px.

This print pipeline (hidden window + @page) is the foundation for Phase 3 receipts.

### Dev affordance

`JJPOS_DEBUG_PORT=9222 npm run dev` exposes CDP for E2E driving/inspection. Never set in production.

### Next: Phase 3 — POS Core

POS screen (scan/search, cart, discounts, cash payment, change), receipt printing, stock deduction via `stock_movements`, hold/recall, void with permission.

Scope additions agreed Jun 13, 2026 (see PLAN §3.2):
- Fullscreen toggle (F11/button) for a kiosk-style cashier view.
- Giant total/change display readable from ~2 meters.
- Voucher barcodes: scan → validate → deduct from total, redeemed atomically with the sale (`vouchers` table, `sales.voucher_discount`).
- Inline supervisor override for voids (supervisor credentials without cashier logout, both users audit-logged).

---

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
