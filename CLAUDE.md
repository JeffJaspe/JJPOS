# CLAUDE.md

Guide for Claude Code working on this project. Read `docs/PLAN.md` for the full feature plan before starting any phase.

## Project

Offline-first desktop POS system (single terminal) with inventory, customer ledger (AR), reports, masterfiles, barcode support, role-based access, and super-admin branding.

## Stack

- Electron + Vue 3 + Vite + Tailwind CSS + Pinia
- SQLite via `better-sqlite3` (synchronous, main process only)
- `electron-builder` for packaging (Windows NSIS installer .exe), `jsbarcode` for barcode rendering
- **Local-only**: SQLite database file lives in `app.getPath('userData')/data/pos.db` — created on first launch, survives app updates/reinstalls. No network calls anywhere in the app.
- Currency: Philippine Peso (₱). Dates displayed as `MMM dd, yyyy`.

## Architecture rules (non-negotiable)

1. **All database access lives in the Electron main process.** The renderer NEVER imports better-sqlite3 or touches the DB. All data flows through IPC: `ipcMain.handle('items:list', ...)` ↔ `window.api.items.list()` exposed via preload `contextBridge`.
2. `contextIsolation: true`, `nodeIntegration: false`. No exceptions.
3. **Every IPC handler checks permissions server-side** against the logged-in user's `role_permissions` before acting. Hiding a menu in the UI is not security.
4. All writes that touch money or stock are wrapped in a SQLite transaction (e.g., completing a sale inserts `sales`, `sale_items`, `payments`, `stock_movements`, and optional `ledger_entries` atomically).
5. Stock on hand is derived from `stock_movements`; if a cached `qty_on_hand` column is used, update it inside the same transaction.
6. Schema changes only via numbered migration files in `electron/db/migrations/` (e.g., `003_add_branding.sql`). Never edit old migrations.
7. Passwords hashed with bcrypt. Never log credentials or store plaintext.

## Project structure

```
electron/
  main.ts          app lifecycle, window creation
  preload.ts       contextBridge API surface
  db/index.ts      sqlite init + migration runner
  db/migrations/   numbered .sql files
  ipc/             one file per domain: items, customers, sales,
                   inventory, ledger, reports, users, branding
src/
  views/           Pos, Items, Customers, Inventory, Ledger,
                   Reports, Settings, Login
  components/
  stores/          auth, cart, settings (Pinia)
  composables/     useBarcodeScanner, usePrinter, usePermissions
docs/PLAN.md       full feature plan and schema
```

## Roles & permissions

- Built-in roles: Super admin (locked), Supervisor admin, Cashier, Report account. Super admin can create custom roles.
- `role_menus` controls sidebar visibility; `role_permissions` controls actions (sell, void, price_override, edit_items, edit_customers, stock_adjust, approve_voids, export_reports, manage_branding, manage_users, manage_settings).
- Vue router guards check menus; IPC handlers check permissions. Both, always.

## UI conventions

- Collapsible sidebar (full ↔ icon-only) toggled by a burger button; active accent color and logo come from the `branding` table.
- POS screen is keyboard/barcode-first: a focused input captures scans (scanner sends code + Enter). Support hold/recall, split payment, charge-to-account.
- Use Tailwind utilities; keep components small and typed (TypeScript everywhere).

## Animation & feel

The app should feel smooth and native, never janky:

- Sidebar collapse/expand: animate width with `transition-all duration-200 ease-in-out`; fade labels with opacity.
- Page navigation: Vue Router `<Transition>` with a subtle fade + 8px slide (`duration-150`). Never block input while transitioning.
- Buttons/clicks: `active:scale-[0.98] transition-transform duration-100` for tactile press feedback; hover states on all interactive elements.
- Modals/drawers: fade backdrop + scale-in panel (`duration-200`); Esc closes.
- Lists (cart lines, search results): Vue `<TransitionGroup>` for enter/leave so added/removed rows slide in/out instead of popping.
- Toast notifications for saves/errors: slide in from top-right, auto-dismiss 3s.
- Rules: keep all animations 100–250ms; use only `transform` and `opacity` (GPU-friendly — never animate width/height/top/left except the sidebar); respect `prefers-reduced-motion`; POS checkout flow must never be delayed by an animation.

## Workflow expectations

- Work phase by phase per `docs/PLAN.md`. Do not jump ahead or add unrequested features.
- After each phase, the app must run via `npm run dev` with no console errors.
- Write a short summary of what changed and any pending decisions at the end of each task.
- When a requirement is ambiguous, ask before implementing — especially around money, stock, or permissions.
