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

### 3.2 POS / Sales Screen
- Barcode-first workflow: scan → item added → quantity editable
- Manual search by name/SKU with keyboard shortcuts (F-keys for speed)
- Cart panel: qty, price override (permission-gated), line discount, remove
- Discounts: per-line and whole-transaction (% or fixed); senior/PWD discount preset if Philippine compliance is needed
- Payment: cash (with change computation), card, GCash/e-wallet, split payment, **charge to account (credit sale → ledger)**
- Hold/recall transactions
- Receipt printing (thermal 58/80mm) + reprint
- Void/return flow (admin PIN required), returns restock inventory
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
      discount, tax, total, payment_type, amount_paid, change,
      status [completed|voided|held])
sale_items(id, sale_id, item_id, qty, price, cost_at_sale,
           line_discount, line_total)
payments(id, sale_id, method, amount)   -- supports split payment

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
- **Lookup:** match against `item_barcodes.barcode` (exact, indexed).
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
- Receipt printing, stock deduction via `stock_movements`
- Hold/recall, void with permission

**Phase 4 — Inventory (week 5–6)**
- Stock-in, adjustments, movement history, low-stock alerts, stocktake

**Phase 5 — Ledger & Credit Sales (week 6–7)**
- Charge-to-account at POS, collections screen, SOA, aging

**Phase 6 — Reports, Admin & Polish (week 7–9)**
- All reports + Excel/PDF export, Z-reading
- Branding screen (palettes, custom color picker, icon library, logo upload)
- Role builder screen (custom roles, menu visibility, permissions)
- Backup/restore, audit log, NSIS installer via electron-builder, auto-update

---

## 9. Key Decisions to Make Early

1. **Single terminal or multi-terminal?** SQLite is perfect for one machine; if multiple POS terminals must share data live, plan a small local server (e.g., Node/Postgres on LAN) instead.
2. **Receipt printer model** — thermal ESC/POS vs. regular printer changes the printing code.
3. **VAT/BIR compliance** (if Philippines retail) — affects receipt format, Z-reading, and discount handling for senior/PWD.
4. **Cost method** — capture cost at time of sale (simplest, recommended) vs. moving average.
