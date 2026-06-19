# STATUS — plan vs. done (at-a-glance)

> Quick checklist mapping `PLAN.md` → what's actually built. Update this when a feature lands.
> Narrative details for each item live in `PROGRESS.md`. Last updated: **Jun 19, 2026**.

**Legend:** ✅ done · 🟡 partial · ⬜ not started · ⏭️ intentionally skipped

---

## Build phases (PLAN §8)

| Phase | Scope | Status |
|---|---|---|
| 1 — Foundation | Electron/Vue/Tailwind scaffold, IPC, SQLite + migrations, login, roles, app shell | ✅ |
| 2 — Masterfiles | Items + barcodes + labels, customers, categories, suppliers | ✅ |
| 3 — POS Core | Scan/cart/discounts/cash, fullscreen, promos, vouchers, receipts, hold/recall, void+override | ✅ |
| 4 — Inventory | Stock-in, adjustments, stocktake, movements, low-stock | ✅ |
| 5 — Ledger & Credit | Charge-to-account, collections, SOA, aging | ✅ |
| 5b — Payments | Card/GCash/PayMaya setup, richer check/PDC capture | ✅ |
| 6 — Reports, Admin, Polish | (see breakdown below) | 🟡 |
| 7 — Multi-Station networking (optional) | Hub-and-spoke (PLAN §10) | ⬜ |

---

## Phase 6 breakdown (PLAN §3.5, §3.6)

| Item | Status |
|---|---|
| Reports suite (daily/Z-reading, by item/category, profit, inventory valuation) | ✅ |
| Excel + PDF/print export | ✅ |
| Transactions report + Audit/security report (`view_audit`) | ✅ |
| Branding (logo upload, icon library, 3 colors, favicon) | ✅ |
| Role builder (custom roles, menus, permissions) + Users management | ✅ |
| Store settings (name/address, VAT rate+mode, printer, BIR invoice numbering) | ✅ |
| Receipt designer (configurable template, live preview) | ✅ |
| **DB backup / restore + scheduled auto-backup** | ✅ (Jun 16) |
| **NSIS installer** (electron-builder, `npm run dist`) | ✅ built — but **exe is stale** (Jun 14, predates backup feature; rebuild before distributing) |
| Auto-update | ⏭️ skipped on purpose (offline-only app; update by running a newer Setup.exe) |

---

## Still pending

| Item | PLAN ref | Status | Notes |
|---|---|---|---|
| **Manual "Clear cart" button** (with confirm) | §3.2, §10.11 | ✅ (Jun 19) | POS "Clear Cart" button + confirm modal; empties cart and drops the local draft |
| **Cart autosave + crash recovery** | §10.11 | ✅ (Jun 19) | `cart-draft.json` autosave while signed in; "Recover / Discard" offered to the same cashier next login; logout reminds + clears a non-empty cart |
| **Multi-station: station config + Settings UI** | §10.9 ①, §10.5 | ⬜ | Standalone/Hub/Client mode picker, `station.json`, Hub LAN-IP display, Test connection, spec-readiness check (§10.6) |
| **Multi-station: Hub server** | §10.9 ②, §10.3 | ⬜ | Shared dispatch map + LAN `/rpc` endpoint, access-key gate |
| **Multi-station: Client transport + token auth** | §10.9 ③, §10.4 | ⬜ | Client forwarding layer, per-station tokens, per-request `requireAuth` |
| **Multi-station: Connections tab + polish** | §10.9 ④, §10.7 | ⬜ | Live station monitor, revoke/disconnect, offline banners |

> Schema groundwork already in place: migration `010_si_year_series.sql` adds the per-year
> `SI{YYYY}-{NNNNNN}` series needed for the shared Hub SI counter (PLAN §10.1).

---

## Migrations applied (current: 011)

`001_init` · `002_masterfiles` · `003_pos` · `004_roles` · `005_pos_special_discount` ·
`006_discount_perm` · `007_audit_perm` · `008_ledger_ar` · `009_payments` ·
`010_si_year_series` · `011_backup`
