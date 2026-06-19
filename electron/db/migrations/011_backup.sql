-- 011_backup.sql — database backup / restore
--
-- Adds the `manage_backup` permission (granted to the locked Superadmin; other
-- roles opt in via the role builder) and seeds backup configuration:
--   backup_folder    — where backups are written ('' = default userData/backups)
--   backup_retention — how many backups to keep (oldest auto-pruned)
--   backup_last_date — local YYYY-MM-DD of the last automatic backup (daily guard)

INSERT OR IGNORE INTO role_permissions (role_id, perm_key)
SELECT id, 'manage_backup' FROM roles WHERE locked = 1;

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('backup_folder', ''),
  ('backup_retention', '14'),
  ('backup_last_date', '');
