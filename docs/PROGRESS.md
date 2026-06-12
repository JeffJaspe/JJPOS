# Progress

## Phase 4 — Inventory ✅ (Jun 13, 2026)

Stock-in, adjustments, stocktake, movement history, and low-stock view. No schema changes needed — everything rides on `stock_movements` + `items.qty_on_hand` from migration 001. Verified end-to-end via CDP (UI receive +24 w/ cost update, −3 damage adjustment, stocktake to a counted figure, low-stock threshold appearing/clearing).

### What's in place

- **Inventory view with tabs**: Stock In / Adjust / Stocktake (require `stock_adjust`; tabs hidden otherwise) + Movements / Low Stock (any inventory-menu holder).
- **Stock In**: supplier (optional) + required reference no. (DR/invoice) + scan-to-add lines; per-line qty and optional new unit cost (updates `items.cost_price` — future sales capture the new cost, history keeps `cost_at_sale`); one transaction; audit-logged.
- **Adjust**: single item, signed qty change, reason codes (damage / loss / expired / count correction / other) + note; shows resulting on-hand before committing; audit-logged.
- **Stocktake**: scan-as-you-count (repeat scans increment), editable counted qty, live variance column; commit writes a `count` movement for each variance and sets `qty_on_hand` to the counted figure; matched lines untouched; audit-logged.
- **Movements**: filterable history (type, item), color-coded types, signed quantities, note + user — the full trail including sales/void returns from Phase 3.
- **Low Stock**: items at/below reorder level with a suggested order quantity (2× reorder − on hand).
- Shared `ItemPicker` component (scan/search dropdown) reused across panels.

### Next: Phase 5 — Ledger & Credit Sales

Collections screen, customer statements (SOA), aging — charge-to-account at POS already posts ledger debits since Phase 3.

---

## Phase 3 — POS Core ✅ (Jun 13, 2026)

Full POS: scan/search → cart → discounts/promos/vouchers → payment → receipt → stock deduction, plus hold/recall, void with supervisor override, fullscreen kiosk view, and the Promos/Vouchers management tabs. Verified end-to-end over CDP by driving the real UI (sale SI-000001: 2 × promo-priced item − ₱20 voucher = ₱1.60, then voided — stock and voucher restored).

### What's in place

- **POS screen** (`Pos.vue`, cart in Pinia `stores/cart.ts`): one input handles barcode scans, voucher scans, and name/SKU search (single result auto-adds); cart with qty edit, permission-gated price override (audited), per-line ₱ discount, transaction discount ("10%" or amount in one input); TransitionGroup rows.
- **Giant displays**: total panel readable from ~2 m (font auto-shrinks as digits grow so it never clips); full-screen CHANGE overlay after payment; true fullscreen kiosk toggle (F11/button, wider total panel). Keyboard: F9 pay, F10 hold, F11 fullscreen.
- **Sales engine** (`sales:complete`): all money math recomputed server-side in one transaction — promo re-resolution (price must match server promo price unless `price_override`), line/txn discounts, voucher re-validation + atomic redemption, VAT-inclusive tax back-out (txn+voucher discounts shared pro-rata across the vatable base), split payments, charge-to-account with ledger debit + credit-limit block, stock movements + `qty_on_hand`, sequential `SI-` sale numbers.
- **Void** (`sales:void`): own `void` permission or inline supervisor credentials (`approve_voids`), reason required; restores stock (return movements), reverses ledger charges, reactivates redeemed vouchers; audit logs both users.
- **Hold/recall**: `held_sales` table stores JSON cart snapshots (no sale_no, no stock impact); recall is delete+restore in one transaction.
- **Receipts**: `utils/receipt.ts` builds a thermal-width doc (58/80 mm from `receipt_width_mm`); `print:receipt` measures content height, sizes @page to it, and prints silently to `receipt_printer` (or system default) — checkout never blocks on a dialog; failures toast without affecting the sale. Reprint-last button. `receipt_auto_print` setting can disable auto print.
- **Promos tab**: CRUD with type (% / amount off / fixed price), optional schedule (local ↔ UTC converted), multi-item picker; deactivate-not-delete; POS picks the lowest resulting price; `sale_items.promo_id` records what applied.
- **Vouchers tab** (`manage_vouchers` only): batch issue (1–100) with `9`-prefixed EAN-13 codes from a dedicated sequence (can't collide with `2`-prefixed item barcodes), optional expiry, label printing; cancel only while active; issue/cancel audit-logged.
- `settings:get`/`settings:set` IPC (set requires `manage_settings`; sequence counters protected).

### Notes / deferred

- Stock may go negative on sale (small-store reality); Phase 4 adjustments/stocktake correct it.
- Supervisor-override UI path exercised by review only — needs a second (cashier) user account, which arrives with user management in Phase 6.
- ESC/POS raw printing not used; receipts go through Windows printer drivers (works for receipt printers with a driver). Revisit only if a driverless printer shows up.
- Test data left in the DB on purpose (named "Test Promo 10%", two ₱20 e2e vouchers, one voided sale) — usable as demo data, safe to deactivate/cancel.

### Next: Phase 4 — Inventory

Stock-in, adjustments with reason codes, movement history, low-stock alerts, stocktake.

---

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
- Voucher issuance: new tab in the Items view (with Categories/Suppliers); create single/batch, print barcodes via the label pipeline; gated by a new `manage_vouchers` permission (migration; seeded to Super admin & Supervisor admin); issue/cancel audit-logged; redeemed/cancelled vouchers immutable.
- Promos: item-specific scheduled discounts (Items → Promos tab, `edit_items`); % off / amount off / fixed price, optional date range, multi-item; POS auto-applies best active promo and records `sale_items.promo_id`; deactivate-not-delete for history.
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
