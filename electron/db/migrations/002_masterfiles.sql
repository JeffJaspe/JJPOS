-- 002_masterfiles.sql — Phase 2 seeds
--
-- * edit_customers: customer masterfile writes are a separate concern from
--   item writes (a stock clerk may edit items but not credit limits).
-- * barcode_sequence: counter behind auto-generated internal EAN-13 barcodes
--   ('2' in-store prefix + 11-digit sequence + check digit).

INSERT INTO role_permissions (role_id, perm_key)
SELECT r.id, 'edit_customers' FROM roles r WHERE r.name IN ('Super admin', 'Supervisor admin');

INSERT INTO settings (key, value) VALUES ('barcode_sequence', '0');
