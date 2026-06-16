# POS Desktop App — Development Plan

## 1. Overview

A standalone desktop Point-of-Sale system built with Electron, featuring inventory management, sales/reports, customer ledger, and masterfile maintenance (customers, items) with barcode support. Local-only (SQLite file database), runs fully offline, distributed as a Windows installer .exe. Suitable for small retail stores.

---

## 2. Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Shell | Electron | Cross-platform desktop (Windows/Mac/Linux) |
| Frontend | Vue 3 + Vite + Tailwind CSS | Fast dev, component-based |
| State | Pinia | Simple store for cart, session, settings |
| Database | SQLite (via `better-sqlite3`) | Embedded local file, zero-config, offline-first |
| Barcode scanning | Keyboard-wedge input (USB scanners act as keyboards) | No special driver needed |
| Barcode generation | `jsbarcode` (Code 128 / EAN-13) | Render barcodes for item labels |
| Printing | Electron `webContents.print()` + ESC/POS (`node-thermal-printer`) for receipts | A4 reports and thermal receipts |
| Packaging | `electron-builder` (NSIS installer .exe) | Installers + auto-update support |
| Reports export | `exceljs` (Excel), `pdfmake` or print-to-PDF | Common store requirement |

**Architecture rule:** All database access happens in the Electron **main process**, exposed to the renderer via IPC (`ipcMain.handle` / `ipcRenderer.invoke`) through a preload script with `contextIsolation: true`. The Vue app never touches the DB directly.

**Database location:** `app.getPath('userData')/data/pos.db` — created on first launch, survives app updates and reinstalls. Backup = copy this one file.

---

## 3. Module Breakdown

### 3.1 Masterfiles
**Items**
- Fields: SKU, barcode, name, description, category, unit (pc/box/kg), cost price, selling price, wholesale price (optional), reorder level, tax type (VAT/non-VAT), active flag, image (optional)
- Multiple barcodes per item (supplier barcode + internal barcode)
- Barcode setup screen:
  - Scan to assign an existing barcode, or
  - Auto-generate internal barcode (e.g., prefixed sequence `200000000001`)
  - Print labels (single or batch) via label/thermal printer
- Item units & conversions (e.g., 1 box = 12 pcs) — optional phase 2

**Customers**
- Fields: code, name, contact, address, TIN (if needed), credit limit, payment terms (COD / 7 / 15 / 30 days), opening balance, active flag
- Used by ledger and credit (AR) sales

**Other masterfiles**
- Categories, Suppliers, Users (role-based), Payment methods, Store settings (name, address, receipt header/footer, VAT rate, currency ₱)

**Promos (tab in the Items menu, alongside Categories/Suppliers)**
- Item-specific discounts for promos/sales, managed by users with `edit_items`
- A promo has: name (shows on cart line & receipt), discount type (% off, amount off, or fixed promo price), value, optional start/end datetimes (open-ended allowed), active flag, and the list of items it covers
- POS applies the best active promo automatically when an item is scanned (lowest resulting price wins on overlap); the cart line shows the promo name and the markdown
- The applied promo is recorded per sale line (`sale_items.promo_id`) so reports can measure promo performance
- Past promos are kept (deactivate, don't delete) for reporting history

**Vouchers (tab in the Items menu, alongside Categories/Suppliers)**
- Controlled issuance: only users with `manage_vouchers` (seeded to Super admin & Supervisor admin) can create or cancel vouchers; every issue/cancel is audit-logged
- Create single or batch; code auto-generated (internal barcode sequence) or typed; fixed amount or percent; optional expiry and note
- Print voucher barcodes via the label print pipeline
- Status lifecycle: active → redeemed (at POS, atomic with the sale) or cancelled; redeemed/cancelled vouchers are never deletable — they are history

### 3.2 POS / Sales Screen
- Barcode-first workflow: scan → item added → quantity editable
- Manual search by name/SKU with keyboard shortcuts (F-keys for speed)
- **Fullscreen mode**: the POS screen can toggle true fullscreen (F11 or on-screen button) — chrome-free kiosk view for the cashier station
- **Giant total display**: the amount to pay is rendered huge — readable from ~2 meters — so the customer can verify it at a glance; change due gets the same treatment after payment
- Cart panel: qty, price override (permission-gated), line discount, remove
- Discounts: per-line and whole-transaction (% or fixed); senior/PWD discount preset if Philippine compliance is needed
- **Promo pricing auto-applies**: scanning an item covered by an active promo (see 3.1) uses the promo price automatically — cart line shows the promo name; no cashier action needed
- **Vouchers**: scan a voucher barcode at POS → validated (active, not expired, not yet redeemed) and its value deducted from the total; the voucher is marked redeemed atomically with the sale and the redemption is recorded on the sale. Issuance is managed in the Items → Vouchers tab (see 3.1), gated by `manage_vouchers`
- Payment: cash (with change computation), card, GCash/e-wallet, split payment, **charge to account (credit sale → ledger)**
- Hold/recall transactions
- **Clear cart**: a manual button to discard the current cart in one action (with confirm)
- **Crash / power / network recovery**: the active cart is autosaved locally and offered back to the same cashier after an unexpected shutdown or lost connection — see §10.11
- Receipt printing (thermal 58/80mm) + reprint
- **Void with supervisor override**: if the cashier lacks the void permission, a supervisor/admin approves inline by entering their credentials (PIN-style prompt) without logging the cashier out; the audit log records who approved and for whom. Returns restock inventory
- Offline by design — no internet dependency

### 3.3 Inventory
- Stock-in (receiving from supplier, with reference no. and cost update)
- Stock adjustment (damage, loss, count corrections) with reason codes
- Stock movement history per item (every sale, return, adjustment logged in `stock_movements`)
- Physical count / stocktake mode (scan + count, generates adjustment)
- Low-stock alerts based on reorder level
- (Phase 2) Purchase orders, supplier returns, multi-branch transfer

### 3.4 Customer Ledger (AR)
- Every credit sale posts a **debit** to the customer ledger
- Payments/collections post a **credit** (with OR number)
- Running balance per customer, aging report (current / 30 / 60 / 90+)
- Statement of account printable per customer
- Credit limit enforcement at POS (warn or block)

### 3.5 Reports
- Daily sales summary (X/Z reading style): gross, discounts, returns, net, by payment method, by cashier
- Sales by item / category / customer / date range
- Profit report (sales price vs. cost — uses cost captured at time of sale)
- Inventory reports: stock on hand, valuation, low stock, movement history
- AR reports: aging, collections, outstanding balances
- Export to Excel/PDF; print-friendly layouts

### 3.6 Settings & Admin
- **Branding (super admin only):** app name, logo — upload an image *or* pick an icon from a built-in icon library — accent color via ready-made palette presets or a custom color picker, icon style toggle. Shown in sidebar, login screen, and receipts; stored in `branding` table, uploads saved to app data folder
- **Role builder (super admin only):** create/edit custom roles, choose which sidebar menus are visible per role, and toggle granular permissions (sell, void, price override, edit costs, stock adjust, reports, settings). Built-in roles (Super admin, Supervisor admin, Cashier, Report account) are seeded but editable; Super admin role is locked
- User accounts assigned to a role; menu and IPC access both enforced from `role_permissions`
- Receipt template config
- Database backup/restore (copy SQLite file + scheduled auto-backup to a folder/USB)
- Audit log (voids, price overrides, adjustments, logins)

---

## 4. Database Schema (core tables)

```
users(id, username, password_hash, role_id, active)
roles(id, name, is_system, locked)
role_menus(id, role_id, menu_key)          -- which sidebar items show
role_permissions(id, role_id, perm_key)    -- granular actions (void, override, ...)
branding(key, value)                       -- app_name, logo_value, accent_color
categories(id, name)
suppliers(id, name, contact)
items(id, sku, name, category_id, unit, cost_price, sell_price,
      reorder_level, tax_type, active)
item_barcodes(id, item_id, barcode UNIQUE)
customers(id, code, name, contact, address, credit_limit,
          terms_days, active)

sales(id, sale_no, datetime, customer_id NULL, user_id, subtotal,
      discount, voucher_discount, tax, total, payment_type,
      amount_paid, change, status [completed|voided|held])
sale_items(id, sale_id, item_id, qty, price, cost_at_sale,
           line_discount, promo_id NULL, line_total)
payments(id, sale_id, method, amount)   -- supports split payment

promos(id, name, type [percent|amount|fixed_price], value,
      starts_at NULL, ends_at NULL, active, created_at)
promo_items(id, promo_id, item_id, UNIQUE(promo_id, item_id))

vouchers(id, code UNIQUE, type [fixed|percent], value,
      expires_at NULL, status [active|redeemed|cancelled],
      redeemed_sale_id NULL, redeemed_at NULL, note, created_at)

stock_movements(id, item_id, datetime, type
      [sale|return|stock_in|adjustment|count],
      qty_change, ref_table, ref_id, user_id, note)

ledger_entries(id, customer_id, datetime, type [charge|payment|adj],
      ref_no, debit, credit, note, user_id)

settings(key, value)
audit_log(id, datetime, user_id, action, detail)
```

Stock on hand = `SUM(qty_change)` from `stock_movements` (or maintain a cached `qty_on_hand` column updated in the same transaction).

---

## 5. Barcode Handling Details

- **Scanning:** USB scanners type the code + Enter. Capture with a global focused input on the POS screen; debounce-detect scanner speed vs. human typing for scan-anywhere behavior.
- **Lookup:** match against `item_barcodes.barcode` (exact, indexed). At POS, a scan that doesn't match an item is checked against `vouchers.code` — voucher scans apply as a deduction instead of adding a line.
- **Generating:** for unlabeled items, generate EAN-13 (with check digit) or Code 128 from an internal sequence; render with `jsbarcode` and print on label stock.
- **Weighted items (optional):** support scale barcodes (prefix 2 + item code + embedded weight/price).

---

## 6. UI / UX

- Web-style desktop shell: collapsible sidebar (full ↔ icon-only) with burger toggle, top bar with page title and user menu
- Branding-driven: logo/icon, app name, and accent color from the `branding` table applied to sidebar, login, buttons, and receipts
- Smooth animations: sidebar slide (200ms), router page fade+slide (150ms), button press scale feedback, animated cart rows (TransitionGroup), toasts; only `transform`/`opacity` animated; checkout flow never delayed by animation
- Keyboard-first POS screen for cashier speed

---

## 7. Project Structure

```
pos-app/
├─ CLAUDE.md
├─ docs/
│  ├─ PLAN.md
│  └─ PROGRESS.md
├─ electron/
│  ├─ main.ts            # app lifecycle, windows
│  ├─ preload.ts         # contextBridge API
│  ├─ db/
│  │  ├─ index.ts        # better-sqlite3 init + migrations
│  │  └─ migrations/
│  └─ ipc/
│     ├─ items.ts  customers.ts  sales.ts
│     ├─ inventory.ts  ledger.ts  reports.ts
│     ├─ users.ts  branding.ts
├─ src/                  # Vue 3 renderer
│  ├─ views/  (Login, Pos, Items, Customers, Inventory, Ledger, Reports, Settings)
│  ├─ components/
│  ├─ stores/  (cart, auth, settings)
│  └─ composables/ (useBarcodeScanner, usePrinter, usePermissions)
└─ package.json
```

---

## 8. Build Phases

**Phase 1 — Foundation (week 1–2)**
- Electron + Vue + Tailwind scaffold, IPC bridge, SQLite with migrations
- Login + roles tables seeded (Super admin, Supervisor admin, Cashier, Report account)
- App shell: collapsible sidebar driven by role_menus

**Phase 2 — Masterfiles (week 2–3)**
- Items CRUD with barcode assignment/generation + label printing
- Customers, categories, suppliers CRUD

**Phase 3 — POS Core (week 3–5)**
- POS screen: scan/search, cart, discounts, cash payment, change
- Fullscreen toggle + giant 2-meters-readable total/change display
- Promos tab (item-specific scheduled discounts) + auto-apply at POS
- Voucher scan & redemption (deduct from total, atomic with sale)
- Receipt printing, stock deduction via `stock_movements`
- Hold/recall, void with permission + inline supervisor override (audited)

**Phase 4 — Inventory (week 5–6)**
- Stock-in, adjustments, movement history, low-stock alerts, stocktake

**Phase 5 — Ledger & Credit Sales (week 6–7)**
- Charge-to-account at POS, collections screen, SOA, aging

**Phase 6 — Reports, Admin & Polish (week 7–9)**
- All reports + Excel/PDF export, Z-reading
- Branding screen (palettes, custom color picker, icon library, logo upload)
- Role builder screen (custom roles, menu visibility, permissions)
- Backup/restore, audit log, NSIS installer via electron-builder, auto-update

**Phase 7 — Multi-Station / Hub-and-Spoke Networking (optional, see §10)**
- Station mode (Standalone default / Hub / Client) configurable in Settings, stored per-machine
- Hub serves existing IPC handlers over the LAN; clients forward calls to the hub
- Per-station token auth; shared single SI counter enforced on the hub
- Hub spec-readiness check; Hub "Connections" tab to monitor connected stations

---

## 9. Key Decisions to Make Early

1. **Single terminal or multi-terminal?** SQLite is perfect for one machine. For multiple POS terminals sharing data live, this app uses the **hub-and-spoke** design in §10 (one station hosts the SQLite DB, others connect over the LAN) — a single shared database keeps the SI invoice series correct. For 9+ busy lanes, consider migrating to PostgreSQL on the LAN instead.
2. **Receipt printer model** — thermal ESC/POS vs. regular printer changes the printing code.
3. **VAT/BIR compliance** (if Philippines retail) — affects receipt format, Z-reading, and discount handling for senior/PWD.
4. **Cost method** — capture cost at time of sale (simplest, recommended) vs. moving average.

---

## 10. Multi-Station (Hub-and-Spoke Networking) — Optional

Lets several POS stations on the same indoor LAN share **one live database** so stock, customers, ledger, and especially the **Sales Invoice (SI) number** stay consistent across terminals running simultaneously. Single-terminal installs are unaffected — **Standalone is the default** and behaves exactly as today.

### 10.1 Why hub-and-spoke (not independent DBs)

Stations operate at the same time and must share **one controlled SI series** (no duplicate or skipped numbers). That requires a single source of truth, so one machine (the **Hub**) owns the SQLite database and every other station (a **Client**) asks the Hub for everything. Because all `sales:complete` transactions execute on the Hub, SQLite serializes them and `nextSaleNo()` (year-reset series `SI{YYYY}-{NNNNNN}`) hands out unique, gapless numbers automatically — no distributed locking needed.

**Trade-off (accepted):** Clients require the Hub to be online to sell. There is no offline-then-sync mode — a shared live counter makes that impractical. The Hub should be a PC that stays on during business hours (UPS recommended).

### 10.2 The three station modes

| Mode | DB | Role |
|---|---|---|
| **Standalone** (default) | Local `pos.db` | Single terminal, no network — today's behavior |
| **Hub (server)** | Local `pos.db` | Owns the DB; serves Clients over the LAN; is also a working cashier station |
| **Client** | None | Forwards every request to the Hub over the LAN |

- **Mode is stored per-machine**, not in the shared DB (a Client has no DB). A small local config file (e.g., `station.json` in `userData`) holds `{ mode, hubHost, hubPort, accessKey, stationName }`, read at startup **before** DB init (Standalone/Hub init the DB; Client skips it).
- Changing mode is done in **Settings → Stations/Network** and takes effect after a confirm + app restart.

### 10.3 Transport architecture (reuses existing handlers)

All data already flows through one choke point: `handle(channel, fn)` (`electron/ipc/handle.ts`) returning an `IpcResult` envelope. Networking is a **transport swap**, not a logic rewrite:

- Refactor handler registration into a shared **dispatch map** (`channel → fn`) used by both `ipcMain` and the Hub server.
- **Hub:** main process starts a LAN HTTP/WebSocket server exposing `POST /rpc` with `{ channel, payload }`, dispatching to the same handlers. Binds to the LAN interface; the Hub's own renderer keeps using local IPC.
- **Client:** main process does **not** open a DB. Each `ipcMain` handler becomes a thin forwarder that POSTs `{ channel, payload, token }` to `http://<hubHost>:<hubPort>/rpc` and returns the response. The renderer and `window.api.*` are unchanged.

### 10.4 Authentication (the main rework)

Today the session is a single global in the Hub's main process (`electron/ipc/session.ts`). With multiple Clients it must become **per-connection**:

- `auth:login` on a Client authenticates against the Hub and returns a **station token**; the Client stores it and includes it on every RPC.
- Hub keeps a `token → SessionUser` map; `requireAuth`/`requirePermission` resolve the user from the request token instead of one global.
- A shared **access key** (set on the Hub, entered on each Client) gates which machines may connect at all — so only your stations can reach the Hub.
- All existing server-side permission checks stay exactly as they are.

### 10.5 Settings → Stations/Network tab

User-friendly setup:

- **Mode picker:** Standalone / Hub / Client (with a short description of each).
- **Hub mode:** shows this PC's **LAN IP address(es)** and port to type into Clients; lets you set the access key; runs the **spec-readiness check** (§10.6); opens the **Connections** tab (§10.7).
- **Client mode:** fields for Hub IP + port + access key, a **"Test connection"** button (reports reachable / unreachable / wrong key / version mismatch), and an editable **station name** (e.g., "Lane 2").
- Clear status banner + confirm-and-restart when switching modes.

### 10.6 Hub spec-readiness check

When Hub mode is selected, read this PC's hardware (Electron main: `os.cpus()`, `os.totalmem()`, `os.networkInterfaces()`; disk type via a Windows PowerShell `Get-PhysicalDisk` query) and show a ✅/⚠️ checklist against recommended specs so an underpowered machine isn't chosen by accident:

| Spec | Minimum | Recommended | Why |
|---|---|---|---|
| CPU | Dual-core | Quad-core | Serves all stations' requests |
| RAM | 4 GB | 8 GB | Headroom for reports |
| Disk | — | **SSD** | Biggest factor for SQLite write latency |
| Network | 100 Mbps | **Gigabit, wired** | Stable Hub link |
| Power | — | **UPS** | Power loss = all lanes down + DB risk |

### 10.7 Hub "Connections" tab (Hub mode only)

A live monitoring view, visible only when this machine is the Hub, listing every connected Client station:

- **Per station:** station name, IP address, currently logged-in cashier, status (online / idle), last-activity time, and app version (flag version mismatches).
- **Live updates** as stations connect/disconnect or log in/out.
- **Actions:** revoke/disconnect a station (invalidate its token), and a count of active connections.
- Backed by the Hub's connection registry (token map + per-connection metadata); audit-logged when a station is revoked.

### 10.8 Capacity guidance (SQLite Hub, indoor LAN)

| Stations | Verdict |
|---|---|
| 2–5 | ✅ Sweet spot — SQLite Hub ideal |
| 6–8 | ✅ Fine; watch heavy reports during rush |
| 9+ / very busy | ⚠️ Consider PostgreSQL on the LAN |

Use **wired Gigabit Ethernet for the Hub**; Clients may use Wi-Fi but wired is steadier. LAN latency is sub-millisecond, so RPC overhead is negligible.

### 10.9 Phased delivery

1. **Station config + Settings UI** — mode picker, per-machine config, Client connection fields + "Test connection", Hub LAN-IP display, spec-readiness check. (Standalone stays default; no behavior change for single terminals.)
2. **Hub server** — shared dispatch map + LAN `/rpc` endpoint serving existing handlers; access-key gate.
3. **Client transport + token auth** — Client forwarding layer; per-station tokens; Hub session map; `requireAuth` resolves per request.
4. **Connections tab + polish** — live connections view, revoke/disconnect, connection-status indicator across the app, clear "Hub offline" errors, reconnection handling.

### 10.10 Risks & constraints

- **Hub is a single point of failure** — if it's off/unreachable, Clients can't sell. Mitigate with an always-on Hub + UPS; document this for the store.
- **Backups matter more** — all data lives on the Hub; keep the scheduled `pos.db` backup (to folder/USB) enabled there.
- **Security** — LAN-only binding + shared access key + per-station tokens; plaintext HTTP is acceptable on a closed store LAN, with TLS as a later option.
- **Concurrency** — `better-sqlite3` is synchronous; requests serialize on the Hub. Fine at 2–8 stations; very heavy concurrent reporting could briefly block sales (revisit with PostgreSQL only if needed).

### 10.11 Local cart resilience (crash / power-off / network recovery)

Applies to **all modes** (Standalone, Hub, Client). The cart is renderer state; this protects an in-progress sale from a sudden power-off, app crash, or — on a Client — a dropped connection to the Hub, so the cashier never loses a half-rung transaction.

**This is a deliberate exception to "clear cache/memory on reboot."** Everything else still clears; the *active cart draft* persists locally until it is genuinely finished.

- **Autosave:** on every cart change, write a draft to a small local file in `userData` (e.g., `cart-draft.json`), tagged with `{ stationName, userId, savedAt }`. (Local file, not the shared DB — a Client has no DB, and a draft must survive even when the Hub/network is down.)
- **Recovery:** at app start, if a draft exists (it was never cleared → ungraceful exit), offer it back to the **same cashier** on their next login: "Unfinished sale found — Recover / Discard." Same-user only, to preserve account isolation; a different cashier logging in does not see it.
- **Network loss on a Client:** the cart is local, so it is untouched while the Hub is unreachable; a connection-status banner shows offline, and on reconnect the cashier completes the sale (the Hub assigns the SI number atomically). The autosave adds power-off protection on top.
- **The draft is cleared when** the sale completes, the cashier presses **Clear cart**, or on logout/account switch (existing behavior). Completing a sale deletes the draft as part of the same flow.
- **Manual Clear cart:** a POS button (confirm dialog) that empties the current cart — lines, vouchers, discounts — and removes the draft.

**Reconciliation with earlier rules:** logout/account switch still fully resets the cart (no cross-account leak); a graceful clear removes the draft; only an *unexpected* termination leaves a draft, and only the owning cashier can recover it.
