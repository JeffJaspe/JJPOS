-- 009_payments.sql — payment setup (card / GCash / PayMaya) + richer check details
--
-- Upfront e-wallet/card payment options are configured in Settings → Payments.
-- Checks/PDCs capture the bank and (for PDC) a due date in addition to the
-- issue date already held in check_date.

ALTER TABLE ledger_entries ADD COLUMN bank           TEXT NOT NULL DEFAULT '';  -- drawee bank
ALTER TABLE ledger_entries ADD COLUMN check_due_date TEXT NOT NULL DEFAULT '';  -- PDC maturity date

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('card_enabled', '1'),
  ('gcash_enabled', '1'),
  ('gcash_account_name', ''),
  ('gcash_number', ''),
  ('paymaya_enabled', '1'),
  ('paymaya_account_name', ''),
  ('paymaya_number', '');
