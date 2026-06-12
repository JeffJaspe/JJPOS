-- 003_pos.sql — Phase 3: promos, vouchers, held sales, sale columns, permissions
--
-- Money in centavos; percents stored as whole numbers (10 = 10%).

CREATE TABLE promos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL,                          -- percent | amount | fixed_price
  value      INTEGER NOT NULL,                       -- percent: whole %; amount/fixed_price: centavos
  starts_at  TEXT,                                   -- NULL = no start bound (UTC)
  ends_at    TEXT,                                   -- NULL = no end bound (UTC)
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE promo_items (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  promo_id INTEGER NOT NULL REFERENCES promos(id) ON DELETE CASCADE,
  item_id  INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  UNIQUE (promo_id, item_id)
);

CREATE INDEX idx_promo_items_item ON promo_items(item_id);

CREATE TABLE vouchers (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  code             TEXT NOT NULL UNIQUE,
  type             TEXT NOT NULL DEFAULT 'fixed',    -- fixed | percent
  value            INTEGER NOT NULL,                 -- fixed: centavos; percent: whole %
  expires_at       TEXT,                             -- NULL = never (UTC)
  status           TEXT NOT NULL DEFAULT 'active',   -- active | redeemed | cancelled
  redeemed_sale_id INTEGER REFERENCES sales(id),
  redeemed_at      TEXT,
  note             TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Parked carts (hold/recall). Not real sales: no sale_no, no stock impact.
CREATE TABLE held_sales (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  label      TEXT NOT NULL DEFAULT '',
  payload    TEXT NOT NULL,                          -- JSON cart snapshot
  user_id    INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE sales ADD COLUMN voucher_discount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sale_items ADD COLUMN promo_id INTEGER REFERENCES promos(id);

INSERT INTO role_permissions (role_id, perm_key)
SELECT r.id, 'manage_vouchers' FROM roles r WHERE r.name IN ('Super admin', 'Supervisor admin');

INSERT INTO settings (key, value) VALUES
  ('sale_sequence', '0'),
  ('voucher_sequence', '0'),
  ('receipt_width_mm', '80'),
  ('receipt_printer', ''),
  ('receipt_auto_print', '1');
