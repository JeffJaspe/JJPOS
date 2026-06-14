-- 007_audit_perm.sql — security/audit reports permission
--
-- `view_audit` gates the audit-log reports (logins, supervisor overrides, voids,
-- discounts) separately from ordinary sales reports. Granted to the locked
-- Superadmin; other roles opt in via the role builder.

INSERT OR IGNORE INTO role_permissions (role_id, perm_key)
SELECT id, 'view_audit' FROM roles WHERE locked = 1;
