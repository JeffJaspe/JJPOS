# Progress

## Phase 5b — Payment setup + richer checks ✅ (Jun 14, 2026)

Migration 009 adds `bank` / `check_due_date` to `ledger_entries` and seeds card/GCash/PayMaya settings. Verified by the headless E2E (`scripts/e2e-ledger.cjs`, run via `ELECTRON_RUN_AS_NODE=1 electron`): all **9 migrations** apply, payment settings + check columns present, AR math intact.

- **Payments setup tab** (Settings → Payments, `manage_settings`): configure the upfront tenders — **Card** (accept toggle + physical-reader enable/device, moved here from the Store tab), **GCash** (accept + account name/number), **PayMaya** (accept + account name/number). Stored as settings; "integration" is config-level (no live SDK yet).
- **POS honors enabled methods**: PaymentModal's tender dropdown is now built from settings — Cash & Charge always, Card/GCash/PayMaya only when enabled. New `gcash`/`paymaya` payment methods added to `PaymentMethod`, the sales-engine allow-list, and report/receipt labels (`ewallet` kept for back-compat).
- **Richer check / PDC capture** (AR payment modal): for check & PDC, capture **bank, check no., date issued**, and (PDC) a **due date** — stored in new `ledger_entries.bank` / `check_due_date` columns and shown in the ledger statement (`Check · Bank · #no · iss <date> · due <date>`). AR collections also offer Card/GCash/PayMaya per settings.
- **End-to-end verified** at the data layer (migrations + balance + running balance + FIFO aging + credit-sale FK integrity).

---

## Phase 5 — Ledger & Credit Sales ✅ (Jun 14, 2026)

Built after Phases 6.1–6.3 (it was deferred earlier). Migration 008 adds `method`/`check_no`/`check_date` to `ledger_entries`, grants `manage_ledger` to Superadmin, and seeds card-reader settings. New `electron/ipc/ledger.ts` domain (registered).

- **Customer Ledger view** (`Ledger.vue`, master–detail): searchable customer list with live AR balances → select a customer to see their **statement** with a running balance, **date-range + entry-type filters**, **aging cards** (Balance / Current / 31–60 / 61–90 / 90+), and **Print SOA** + **Export Excel** (via `useReportExport`). `ledger:summary` computes balances and **FIFO aging** (payments applied to oldest charges, remainder bucketed by age); `ledger:entries` returns filtered rows with a carried-forward running balance.
- **AR Payment module** (`ARPaymentModal`, gated `manage_ledger` → "Record Payment" button): records a payment against a customer accepting **cash, check, post-dated check (PDC), card, or e-wallet**, capturing **OR no., check no., and check date**. Posts a `payment` credit to `ledger_entries` and audit-logs `ar_payment`. **Note:** a PDC reduces the AR balance immediately (flagged with its check date) — it is *not* held-until-cleared; revisit if proper PDC custody is needed.
- **Require-customer role** (new `require_customer` permission, opt-in — not seeded to any role): when a cashier's role holds it, `sales:complete` rejects a sale without a `customer_id`, and the PaymentModal shows/requires the customer selector even for non-charge (cash/card) payments. Lets a B2B/wholesale terminal force a customer (AR **or** upfront) on every transaction.
- **Card reader** (Settings → Store): enable toggle + device/port (`card_reader_enabled` / `card_reader_name`). POS & AR card payments surface a reader hint; actual hardware integration is deferred.
- New permissions in the role builder: `require_customer` (Point of Sale group) and `manage_ledger` (Customers & AR group).

### Pending / deferred

- PDC custody (hold until cleared, bounce handling) not modeled — recorded as an immediate payment with check date.
- Card reader is settings-only (no device I/O yet).
- AR aging as a standalone Reports tab not added — aging lives per-customer in the Ledger view.

---

## Phase 6 (part 3) — POS improvements ✅ (Jun 13, 2026)

Cashier-requested POS upgrades before starting Phase 5. Migration 005 adds `sd_type` / `sd_name` / `sd_id` to `sales`. Verified: `npm run typecheck` + `npm run build` clean; dev boot applied migration 005 with no errors.

- **F1 quick item search** (`ItemSearchModal`): F1 (or a "Find Item" button) opens a search modal; type a name/SKU, Enter adds the top match, click adds any result, stays open for adding several, Esc closes. Uses the existing `pos:search`.
- **Line & transaction discount use a ₱/% dropdown**: instead of typing `10%` or a peso amount as free text, each discount has an explicit **₱ / %** selector beside a numeric value (per-line in the cart's "Less" column, and the whole-transaction "Document discount"). Per-line mode+raw value ride on the `CartLine` (UI-only, snapshotted for hold/recall); the engine still reads `sale_items.line_discount` in centavos. The transaction selector drives `cart.discountType`/`discountValue`.
- **Discounts are permission-gated** (new `discount` permission, migration 006 grants it to Superadmin): both the per-line "Less" field and the whole-transaction "Discount" field are disabled unless the cashier holds `discount`; otherwise a "🔒 Unlock (supervisor)" affordance opens the same `SupervisorOverrideModal` (now checking the `discount` permission). Approval unlocks discounts for the sale and the supervisor creds ride along to `sales:complete`, which **re-validates server-side** (a manual line/txn discount from a cashier without `discount` and without a valid approver is rejected) so the UI gate can't be bypassed. Senior/PWD is exempt (ID-verified entitlement). The approver creds are transient — cleared on sale completion and never written into held-sale snapshots.
- **Senior / PWD discount** (`SeniorPwdModal`, transaction-level): a button captures type (Senior/PWD), cardholder name, and **ID number** (required). Applies a **flat 20% transaction discount; VAT still applies and is reported normally** (the store does not VAT-exempt — earlier BIR-exemption build was reverted at the user's request because the receipt shouldn't read "VAT EXEMPT" when VAT is applied). Replaces any manual discount while active. Server recomputes authoritatively in `sales:complete`. ID details are stored on the sale, audit-logged (`senior_pwd_discount`), and printed on the receipt (ID + name + "SC/PWD Disc" line); the VAT line is unchanged. (`CartLine.taxType` still rides along on the cart for future use.)
- **Per-item VAT flag**: the item form's tax-type select is now a **"VAT-inclusive item" checkbox** (maps to `items.tax_type` vat/non_vat) — this is what drives the senior/PWD VAT exemption.
- **Void a cart line is permission-gated**: removing a scanned line needs the `void` permission. A cashier without it triggers an inline **supervisor override** (`SupervisorOverrideModal` → new `auth:verifySupervisor` IPC, which checks credentials + `approve_voids` and audit-logs the approval under the supervisor) — no logout, mirroring the existing sale-void override.
- **Store settings tab** (Settings → Store, `manage_settings`): store name/address, receipt header/footer, **VAT rate** (editable for rate changes; affects future sales only), **VAT mode** (`per_item` vs `overall` — `overall` makes the whole sale VATable, for restaurants; honored in `sales:complete`), receipt **printer** (dropdown from new `print:listPrinters` IPC) + **auto-print** toggle, and **BIR invoice numbering** — invoice prefix (`sale_prefix`, default `SI-`, now read by `sales:complete` instead of a hardcoded prefix) and **next SI number**. The next number goes through a dedicated guarded `settings:setInvoiceNumber` (the `sale_sequence` counter stays in `PROTECTED_KEYS`); it's **forward-only** to avoid duplicate `sale_no` and is audit-logged.
- **Receipt designer tab** (Settings → Receipt, `manage_settings`): the receipt is now a **configurable template** stored as JSON in `settings.receipt_template`. `src/utils/receipt.ts` was refactored to render from an ordered, toggleable element list (logo, store name/address, header, sale info, cashier, customer, senior/PWD, items, totals, VAT, payments, change, footer) plus **custom text lines / dividers / blank lines** with per-element alignment & bold. The designer reorders (▲▼), toggles, adds/removes custom lines, sets paper width (mm), and shows a **live preview** (iframe rendering the real builder against a sample sale) framed by **top + right rulers in mm** for layout accuracy. `buildReceiptHtml` falls back to `defaultReceiptTemplate()` when no template is saved, so existing installs and the POS print path are unaffected. Designer save also writes `receipt_width_mm` so the silent-print `@page` sizing stays in sync.
- **Transactions report** (`reports:transactions` + new Reports tab): one row per sale in the date range — **sale no., date/time, cashier (who created it), customer, payment type, status, total** — with Excel + Print/PDF export. This surfaces the per-transaction user + timestamp the user asked for (the Daily Sales tab already had the by-cashier rollup).
- **Audit / security reports** (`reports:auditLog` + new Reports → Audit tab, gated by the new **`view_audit`** permission — migration 007 grants it to Superadmin): reads `audit_log` with a **category filter** — User logins (login/logout), Manager key approvals (supervisor `override` entries), Voids, Discounts (senior_pwd_discount + price_override), or All — each row showing **date/time, user, action, detail**, with Excel + Print/PDF export. On top of the server category/date filter, the Audit tab has **instant client-side filters**: an **action** dropdown, a **user** dropdown (both derived from the loaded rows), and a free-text **search** across user/action/detail — with a "N of M" count. Exports respect the active filters. Reports tabs are now **role-gated independently**: sales/inventory/transactions tabs need `export_reports`, the Audit tab needs `view_audit`, and the view shows whichever the role allows (or a notice if neither). Both permissions appear in the role builder, so "reports in roles" is fully configurable.

### Notes

- Senior/PWD is a flat 20% off the whole sale with VAT untouched (per user feedback). If true BIR VAT-exemption is later required, switch `sales:complete`/`cart.specialDiscount` back to stripping VAT on vatable lines and show a VAT-exempt breakdown on the receipt.
- The line-void override approver needs `approve_voids` (same permission the sale-void override uses). With the reseeded roles, only Superadmin has it until you grant it to Manager/Supervisor in Settings → Roles.

---

## Phase 6 (part 2) — Branding & Reports ✅ (Jun 13, 2026)

Branding screen and the reports suite (with Excel + PDF/print export). Added `exceljs` (approved) as a dependency; it's externalized for the main process by `externalizeDepsPlugin`, so the main bundle stays small and electron-builder ships it via node_modules. Verified: `npm run typecheck` clean, `npm run build` clean (Reports 42 kB, Settings 41 kB, BrandLogo chunk, main 83 kB with exceljs externalized), dev boot with no startup/migration/exceljs-load errors.

### Branding (Settings → Branding, `manage_branding`)

- **Three brand colors** (revised after first-pass feedback that only one was customizable): **Primary** (`--accent` — buttons, links, active nav), **Secondary** (`--accent-2` — the logo mark), **Sidebar** (`--sidebar` — sidebar background). `branding:set` validates all three as `#rrggbb`, upserts the `branding` table, and audit-logs. New branding keys `accent_color_2` / `sidebar_color`; secondary falls back to primary when empty so existing one-color setups are unchanged. `applyBranding` sets all three CSS vars; `AppShell` drives the sidebar bg from `--sidebar`, `BrandLogo` colors the icon with `--accent-2`.
- **Logo upload reads in the renderer** via a hidden `<input type="file">` + `FileReader.readAsDataURL` (≤1 MB; png/jpg/gif/svg/webp) — no IPC/native-dialog round-trip (the dialog path was unreliable). The resulting **data URL** is stored in `logo_value`, so the logo renders everywhere (sidebar, login at h-20, printed receipts as `<img>`); `img-src 'self' data:` is already in the CSP. `branding:pickLogo` IPC removed.
- **Favicon / app icon upload** (PNG or SVG, ≤500 KB, FileReader → data URL in `branding.favicon`): `applyBranding` sets the HTML document `<link rel=icon>`; the main process sets the window/taskbar icon via `nativeImage` on `branding:set` and on startup (`applyStoredWindowIcon` in `main.ts`). Raster only for the window icon (SVG yields an empty `nativeImage`, so SVG sets the in-app/document favicon but not the taskbar icon). The real `.exe` installer icon is still a build-time electron-builder concern.
- **App name = POS title**: now shown in the top header bar (`{app_name} / {page}`) in addition to the sidebar and login, and still drives `document.title`, so renaming is visible across the POS chrome.
- **`BrandLogo` component** renders an uploaded image or a built-in icon; used in `AppShell` and `Login`. Added ~10 brandable icons to `AppIcon` (tag, gift, sparkles, bolt, heart, star, fire, building, cake, truck).
- **`BrandingPanel`**: app name, logo (upload image **or** pick from a 16-icon grid), three color pickers (palette swatches — dark palette for the sidebar — + custom `<input type=color>`), and a **live preview** of the sidebar header, primary button, and a secondary-colored chip. Saving calls `branding:set` then `settings.setBranding()` (store action) to apply instantly — no reload.

### Reports (Reports view, `export_reports`)

- **`reports.ts` IPC** (all gated `export_reports`): `dailySales` (Z-reading — count/gross/discount/voucher/VAT/net + voided + by-payment-method + by-cashier), `salesByItem` (qty/sales/cost/profit), `salesByCategory`, `inventoryValuation` (qty × cost / × retail, with totals). Only `status='completed'` sales count toward totals; voided are reported separately. Dates: renderer sends UTC bounds (`dayRangeToUtc`, `toUtc` exclusive) computed from local day inputs.
- **`reports:exportExcel`** — generic single-table writer via `exceljs` + native save dialog; columns support `money`/`int`/`percent` number formats, optional title row. Reused by every tab.
- **`Reports.vue`**: tabs **Daily Sales / By Item / By Category / Profit / Inventory**, date-range toolbar with Today/Week/Month presets (Inventory is a live snapshot, no range). Each tab has **Export Excel** and **Print / PDF** (the latter builds an A4 HTML doc and reuses the Phase 2/3 `print:html` pipeline — system dialog lets the user pick a printer or Save as PDF). Profit reuses the by-item query. `useReportExport` composable centralizes Excel + print.
- Money stays in centavos end-to-end; converted to peso numbers only at the Excel edge and formatted via `formatPeso` for screen/print.

### Notes / deferred

- **AR reports (aging/collections/SOA) intentionally omitted** — they belong to the skipped Phase 5 (ledger). The data partially exists (`ledger_entries` debits from Phase 3 charge sales) but the collections flow doesn't, so AR reporting waits for Phase 5.
- `exceljs` pulled transitive deps with audit warnings (fstream/uuid/lodash.isequal) — build-time only, offline app; not running `audit fix --force` (risky). Revisit at packaging.

### Remaining Phase 6

Store-settings tab (store name/address, receipt header/footer, VAT rate, receipt width/printer), DB backup/restore + scheduled auto-backup, audit-log viewer, NSIS installer + auto-update via electron-builder.

---

## Phase 6 (part 1) — Users & Role builder ✅ (Jun 13, 2026)

> Phase 5 (Ledger collections/SOA/aging) deliberately skipped for now at the user's request — charge-to-account already posts ledger debits since Phase 3. Revisit before release.

User-account management and the custom role builder, both under **Settings**. No schema changes — `users`, `roles`, `role_menus`, `role_permissions` all exist from migration 001. Verified via `npm run typecheck`, `npm run build` (all three bundles), and a dev boot (no main-process/IPC/migration errors; the GPU/disk-cache lines in the log are benign Chromium noise from a second running instance).

### What's in place

- **Settings view** now tabbed: **Users** (needs `manage_users`) and **Roles** (Super-admin only). Tabs hidden when not permitted; falls back to a placeholder for the still-pending branding/backup tabs.
- **Users** (`UsersPanel` + `UserFormModal` + `PasswordResetModal`): list with role/status/created; create (username + password + role + active), edit (full name/role/active — username immutable), and separate password reset (min 6 chars, confirm). All `users:*` IPC gated by `manage_users`.
  - Safety guards (server-side): can't deactivate your own account; the system can never be left without ≥1 active Super admin (blocks deactivating/demoting the last one); duplicate username → friendly error. bcrypt 10 rounds, never returns the hash. Every create/update/reset is audit-logged.
- **Roles** (`RolesPanel` + `RoleEditorModal`): list each role with menu/permission summaries, user count, and Locked/Built-in badges; create/edit with menu + permission checkboxes; delete custom roles only
  - **Role editor redesigned**: permissions grouped into categorized cards (Point of Sale, Items & Inventory, Customers, Reports, Administration, + an auto "Other" catch-all) each with a per-group "All" toggle; the Sidebar-menus section has its own "All" toggle and a live "N selected" count. Wider modal, card-based layout. New permission keys land in the right group automatically (or "Other"). (blocked if locked, built-in, or still assigned to users). `roles:list` gated by `manage_users` (Users tab needs the dropdown); create/update/delete gated **Super-admin-only** via new `requireSuperAdmin()` (checks the locked role flag). Menu/perm keys sanitized against the canonical `MENU_KEYS`/`PERM_KEYS` so the renderer can't inject unknown keys. The locked Super admin role can't be edited/deleted — that's the permanent way back in; built-in non-super roles are editable.
- **Session**: `SessionUser` gains `isSuperAdmin` (from `roles.locked` at login); `requireSuperAdmin()` helper added to `session.ts`.
- **Shared**: `MENU_LABELS` / `PERM_LABELS` added to `shared/types.ts` (single source of truth for the role-builder UI); new `UserRow`/`UserCreateInput`/`UserUpdateInput`/`RoleRow`/`RoleInput` types; `window.api.users` + `window.api.roles` in preload.

### Default roles reseeded (migration 004)

At the user's request, the seeded roles now match the store hierarchy: **Superadmin** (locked, renamed from "Super admin", topped up to hold every menu + permission), **Manager** (← Supervisor admin), **Supervisor** (← Cashier), **Clerk** (← Report account). Manager/Supervisor/Clerk have their menus *and* permissions **cleared** — the Superadmin assigns each role's access in Settings → Roles (per the user's "I'll set access" choice). They stay `is_system` (editable, not deletable). `seedDefaultAdmin` now finds the super role by `locked = 1` (not by name) so the rename is safe on fresh installs; user-facing "Super admin" strings updated to "Superadmin".

### Notes / pending

- A role with zero menus can't navigate anywhere; that's expected for the freshly-cleared Manager/Supervisor/Clerk until the admin grants access. Only the admin user (Superadmin) is assigned, so no one is stranded.
- **UsersPanel** loads users and roles independently with error toasts (`safeLoad`) so a stale-preload / failed IPC surfaces the real error instead of a silently empty list; the user form shows a "restart & re-login" hint when no roles load.
- This resolves the Phase 1 "default admin password must be changeable" item and unblocks the Phase 3 supervisor-override flow (a second, non-super user can now exist).
- Role-name rename collisions and unknown-key injection are handled; deleting a built-in role is intentionally blocked (they're editable, not deletable).
- Role delete uses native `window.confirm`; matches the app's destructive-action confirmation needs without a bespoke modal.

### Remaining Phase 6

Branding screen (logo upload + icon library + accent palette/custom picker), store-settings tab, DB backup/restore + auto-backup, audit-log viewer, Reports + Excel (`exceljs`, approved) / PDF export + Z-reading, NSIS installer + auto-update.

---

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

### Fixes after release

- **Modals invisible in fullscreen (Jun 13)**: fullscreen was requested on the POS element, but modals/toasts teleport to `<body>` — outside a fullscreened sub-element the browser doesn't render them. Now fullscreen goes on `documentElement` and the shell hides its sidebar/topbar via a `ui.kiosk` flag (stores/ui.ts), so body-teleported overlays render normally. Leaving the POS view exits kiosk mode.

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
