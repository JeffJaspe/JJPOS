-- 001_init.sql — core schema + seed data
--
-- Conventions:
--   * Money is stored in centavos (INTEGER). ₱1,234.56 -> 123456. Renderer formats for display.
--   * Timestamps are TEXT, ISO 8601 UTC (SQLite datetime('now')). Renderer converts to local time.
--   * Booleans are INTEGER 0/1.

-- ---------------------------------------------------------------------------
-- Auth & access control
-- ---------------------------------------------------------------------------

CREATE TABLE roles (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  is_system  INTEGER NOT NULL DEFAULT 0,  -- seeded role, survives "delete all"
  locked     INTEGER NOT NULL DEFAULT 0   -- Super admin: not editable/deletable
);

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL DEFAULT '',
  role_id       INTEGER NOT NULL REFERENCES roles(id),
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE role_menus (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  role_id  INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  menu_key TEXT NOT NULL,
  UNIQUE (role_id, menu_key)
);

CREATE TABLE role_permissions (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  role_id  INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  perm_key TEXT NOT NULL,
  UNIQUE (role_id, perm_key)
);

-- ---------------------------------------------------------------------------
-- App configuration
-- ---------------------------------------------------------------------------

CREATE TABLE branding (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- ---------------------------------------------------------------------------
-- Masterfiles
-- ---------------------------------------------------------------------------

CREATE TABLE categories (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE suppliers (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '',
  active  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sku           TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  category_id   INTEGER REFERENCES categories(id),
  unit          TEXT NOT NULL DEFAULT 'pc',           -- pc / box / kg / ...
  cost_price    INTEGER NOT NULL DEFAULT 0,           -- centavos
  sell_price    INTEGER NOT NULL DEFAULT 0,           -- centavos
  wholesale_price INTEGER,                            -- centavos, optional
  reorder_level INTEGER NOT NULL DEFAULT 0,
  tax_type      TEXT NOT NULL DEFAULT 'vat',          -- vat / non_vat
  qty_on_hand   INTEGER NOT NULL DEFAULT 0,           -- cache; source of truth is stock_movements
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_items_name ON items(name);

CREATE TABLE item_barcodes (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  barcode TEXT NOT NULL UNIQUE
);

CREATE TABLE customers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  contact         TEXT NOT NULL DEFAULT '',
  address         TEXT NOT NULL DEFAULT '',
  tin             TEXT NOT NULL DEFAULT '',
  credit_limit    INTEGER NOT NULL DEFAULT 0,         -- centavos; 0 = no credit
  terms_days      INTEGER NOT NULL DEFAULT 0,         -- 0 = COD
  opening_balance INTEGER NOT NULL DEFAULT 0,         -- centavos
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_customers_name ON customers(name);

-- ---------------------------------------------------------------------------
-- Sales
-- ---------------------------------------------------------------------------

CREATE TABLE sales (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_no      TEXT NOT NULL UNIQUE,
  datetime     TEXT NOT NULL DEFAULT (datetime('now')),
  customer_id  INTEGER REFERENCES customers(id),
  user_id      INTEGER NOT NULL REFERENCES users(id),
  subtotal     INTEGER NOT NULL,                      -- centavos
  discount     INTEGER NOT NULL DEFAULT 0,            -- centavos, whole-transaction
  tax          INTEGER NOT NULL DEFAULT 0,            -- centavos
  total        INTEGER NOT NULL,                      -- centavos
  payment_type TEXT NOT NULL,                         -- cash / card / ewallet / split / charge
  amount_paid  INTEGER NOT NULL DEFAULT 0,            -- centavos
  change       INTEGER NOT NULL DEFAULT 0,            -- centavos
  status       TEXT NOT NULL DEFAULT 'completed'      -- completed / voided / held
);

CREATE INDEX idx_sales_datetime ON sales(datetime);
CREATE INDEX idx_sales_customer ON sales(customer_id);

CREATE TABLE sale_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id       INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  item_id       INTEGER NOT NULL REFERENCES items(id),
  qty           INTEGER NOT NULL,
  price         INTEGER NOT NULL,                     -- centavos, price actually charged
  cost_at_sale  INTEGER NOT NULL DEFAULT 0,           -- centavos, item cost when sold (profit reports)
  line_discount INTEGER NOT NULL DEFAULT 0,           -- centavos
  line_total    INTEGER NOT NULL                      -- centavos
);

CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_item ON sale_items(item_id);

CREATE TABLE payments (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method  TEXT NOT NULL,                              -- cash / card / ewallet / charge
  amount  INTEGER NOT NULL                            -- centavos
);

CREATE INDEX idx_payments_sale ON payments(sale_id);

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------

CREATE TABLE stock_movements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id    INTEGER NOT NULL REFERENCES items(id),
  datetime   TEXT NOT NULL DEFAULT (datetime('now')),
  type       TEXT NOT NULL,                           -- sale / return / stock_in / adjustment / count
  qty_change INTEGER NOT NULL,                        -- negative = out, positive = in
  ref_table  TEXT,
  ref_id     INTEGER,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  note       TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_stock_movements_item ON stock_movements(item_id);
CREATE INDEX idx_stock_movements_datetime ON stock_movements(datetime);

-- ---------------------------------------------------------------------------
-- Customer ledger (AR)
-- ---------------------------------------------------------------------------

CREATE TABLE ledger_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  datetime    TEXT NOT NULL DEFAULT (datetime('now')),
  type        TEXT NOT NULL,                          -- charge / payment / adj
  ref_no      TEXT NOT NULL DEFAULT '',               -- sale_no or OR number
  debit       INTEGER NOT NULL DEFAULT 0,             -- centavos
  credit      INTEGER NOT NULL DEFAULT 0,             -- centavos
  note        TEXT NOT NULL DEFAULT '',
  user_id     INTEGER NOT NULL REFERENCES users(id)
);

CREATE INDEX idx_ledger_entries_customer ON ledger_entries(customer_id);

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------

CREATE TABLE audit_log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  datetime TEXT NOT NULL DEFAULT (datetime('now')),
  user_id  INTEGER REFERENCES users(id),
  action   TEXT NOT NULL,                             -- login / logout / void / price_override / ...
  detail   TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_audit_log_datetime ON audit_log(datetime);

-- ---------------------------------------------------------------------------
-- Seed: built-in roles
-- ---------------------------------------------------------------------------

INSERT INTO roles (name, is_system, locked) VALUES
  ('Super admin', 1, 1),
  ('Supervisor admin', 1, 0),
  ('Cashier', 1, 0),
  ('Report account', 1, 0);

-- Menus per role
INSERT INTO role_menus (role_id, menu_key)
SELECT r.id, m.menu_key FROM roles r
JOIN (
  SELECT 'Super admin' AS role, 'pos' AS menu_key UNION ALL
  SELECT 'Super admin', 'items' UNION ALL
  SELECT 'Super admin', 'customers' UNION ALL
  SELECT 'Super admin', 'inventory' UNION ALL
  SELECT 'Super admin', 'ledger' UNION ALL
  SELECT 'Super admin', 'reports' UNION ALL
  SELECT 'Super admin', 'settings' UNION ALL
  SELECT 'Supervisor admin', 'pos' UNION ALL
  SELECT 'Supervisor admin', 'items' UNION ALL
  SELECT 'Supervisor admin', 'customers' UNION ALL
  SELECT 'Supervisor admin', 'inventory' UNION ALL
  SELECT 'Supervisor admin', 'ledger' UNION ALL
  SELECT 'Supervisor admin', 'reports' UNION ALL
  SELECT 'Supervisor admin', 'settings' UNION ALL
  SELECT 'Cashier', 'pos' UNION ALL
  SELECT 'Report account', 'reports'
) m ON m.role = r.name;

-- Permissions per role
INSERT INTO role_permissions (role_id, perm_key)
SELECT r.id, p.perm_key FROM roles r
JOIN (
  SELECT 'Super admin' AS role, 'sell' AS perm_key UNION ALL
  SELECT 'Super admin', 'void' UNION ALL
  SELECT 'Super admin', 'price_override' UNION ALL
  SELECT 'Super admin', 'edit_items' UNION ALL
  SELECT 'Super admin', 'stock_adjust' UNION ALL
  SELECT 'Super admin', 'approve_voids' UNION ALL
  SELECT 'Super admin', 'export_reports' UNION ALL
  SELECT 'Super admin', 'manage_branding' UNION ALL
  SELECT 'Super admin', 'manage_users' UNION ALL
  SELECT 'Super admin', 'manage_settings' UNION ALL
  SELECT 'Supervisor admin', 'sell' UNION ALL
  SELECT 'Supervisor admin', 'void' UNION ALL
  SELECT 'Supervisor admin', 'price_override' UNION ALL
  SELECT 'Supervisor admin', 'edit_items' UNION ALL
  SELECT 'Supervisor admin', 'stock_adjust' UNION ALL
  SELECT 'Supervisor admin', 'approve_voids' UNION ALL
  SELECT 'Supervisor admin', 'export_reports' UNION ALL
  SELECT 'Supervisor admin', 'manage_settings' UNION ALL
  SELECT 'Cashier', 'sell' UNION ALL
  SELECT 'Report account', 'export_reports'
) p ON p.role = r.name;

-- ---------------------------------------------------------------------------
-- Seed: branding & settings defaults
-- ---------------------------------------------------------------------------

INSERT INTO branding (key, value) VALUES
  ('app_name', 'JJ POS'),
  ('accent_color', '#4f46e5'),
  ('logo_type', 'icon'),
  ('logo_value', 'storefront');

INSERT INTO settings (key, value) VALUES
  ('store_name', 'My Store'),
  ('store_address', ''),
  ('receipt_header', ''),
  ('receipt_footer', 'Thank you, come again!'),
  ('vat_rate', '12'),
  ('currency_symbol', '₱');
