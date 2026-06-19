-- 012_price_log.sql — item price-change log permission
--
-- `view_price_log` gates the Price Changes report (old→new cost/sell/wholesale
-- edits captured when an item is saved) separately from the full audit log, so a
-- role can review pricing history without seeing logins/voids/overrides. Granted
-- to the locked Superadmin; other roles opt in via the role builder.

INSERT OR IGNORE INTO role_permissions (role_id, perm_key)
SELECT id, 'view_price_log' FROM roles WHERE locked = 1;
