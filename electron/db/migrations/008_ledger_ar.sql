-- 008_ledger_ar.sql — Phase 5: AR payments + customer-required sales
--
-- Ledger entries gain payment-method details so collections can record cash,
-- check, post-dated check (PDC), card, or e-wallet against a customer's AR.

ALTER TABLE ledger_entries ADD COLUMN method     TEXT NOT NULL DEFAULT '';  -- cash|check|pdc|card|ewallet
ALTER TABLE ledger_entries ADD COLUMN check_no   TEXT NOT NULL DEFAULT '';  -- check number (check/pdc)
ALTER TABLE ledger_entries ADD COLUMN check_date TEXT NOT NULL DEFAULT '';  -- check date (PDC = future)

-- New permissions.
--  * manage_ledger  → record AR payments / adjustments (granted to Superadmin)
--  * require_customer → role must attach a customer to every sale (opt-in, NOT
--    granted by default — assign it to the role that needs it via the builder)
INSERT OR IGNORE INTO role_permissions (role_id, perm_key)
SELECT id, 'manage_ledger' FROM roles WHERE locked = 1;

-- Card reader: stub settings so the register/collections are "ready" for a
-- physical reader configured here (no hardware integration yet).
INSERT OR IGNORE INTO settings (key, value) VALUES ('card_reader_enabled', '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('card_reader_name', '');
