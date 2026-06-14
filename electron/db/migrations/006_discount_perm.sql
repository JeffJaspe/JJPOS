-- 006_discount_perm.sql — gate POS discounts behind a permission
--
-- Manual line/transaction discounts now require the `discount` permission
-- (a cashier without it needs inline supervisor approval). Grant it to the
-- locked Superadmin so it retains full access; other roles opt in via the
-- role builder.

INSERT OR IGNORE INTO role_permissions (role_id, perm_key)
SELECT id, 'discount' FROM roles WHERE locked = 1;
