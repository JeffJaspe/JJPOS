-- 004_roles.sql — Phase 6: align the default roles to the store's hierarchy
--
-- Superadmin (locked) keeps full access. The three editable built-ins are renamed
-- to Manager / Supervisor / Clerk and have their access cleared — the Super admin
-- assigns each role's modules and permissions in Settings → Roles.
--
-- Roles are matched by their current state (the locked flag / the original seed
-- names) so this is safe to apply to an existing database.

-- 1. Rename the locked super role.
UPDATE roles SET name = 'Superadmin' WHERE locked = 1;

-- 2. Guarantee Superadmin truly has every menu and permission — covers any key a
--    prior migration's seed may have missed (e.g. edit_customers, manage_vouchers).
INSERT OR IGNORE INTO role_menus (role_id, menu_key)
SELECT r.id, m.menu_key FROM roles r
JOIN (
  SELECT 'pos' AS menu_key UNION ALL SELECT 'items' UNION ALL SELECT 'customers'
  UNION ALL SELECT 'inventory' UNION ALL SELECT 'ledger' UNION ALL SELECT 'reports'
  UNION ALL SELECT 'settings'
) m
WHERE r.locked = 1;

INSERT OR IGNORE INTO role_permissions (role_id, perm_key)
SELECT r.id, p.perm_key FROM roles r
JOIN (
  SELECT 'sell' AS perm_key UNION ALL SELECT 'void' UNION ALL SELECT 'price_override'
  UNION ALL SELECT 'edit_items' UNION ALL SELECT 'edit_customers' UNION ALL SELECT 'manage_vouchers'
  UNION ALL SELECT 'stock_adjust' UNION ALL SELECT 'approve_voids' UNION ALL SELECT 'export_reports'
  UNION ALL SELECT 'manage_branding' UNION ALL SELECT 'manage_users' UNION ALL SELECT 'manage_settings'
) p
WHERE r.locked = 1;

-- 3. Rename the three editable built-ins to the store's hierarchy.
UPDATE roles SET name = 'Manager'    WHERE name = 'Supervisor admin';
UPDATE roles SET name = 'Supervisor' WHERE name = 'Cashier';
UPDATE roles SET name = 'Clerk'      WHERE name = 'Report account';

-- 4. Clear their access — the admin grants modules/permissions per role in the Roles tab.
DELETE FROM role_menus
WHERE role_id IN (SELECT id FROM roles WHERE name IN ('Manager', 'Supervisor', 'Clerk'));
DELETE FROM role_permissions
WHERE role_id IN (SELECT id FROM roles WHERE name IN ('Manager', 'Supervisor', 'Clerk'));
