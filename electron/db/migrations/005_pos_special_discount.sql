-- 005_pos_special_discount.sql — Phase 6 POS improvements
--
-- Senior citizen / PWD discounts are applied at the transaction level and must
-- capture the presented ID for BIR compliance. Stored on the sale.

ALTER TABLE sales ADD COLUMN sd_type TEXT NOT NULL DEFAULT '';  -- '' | 'senior' | 'pwd'
ALTER TABLE sales ADD COLUMN sd_name TEXT NOT NULL DEFAULT '';  -- ID holder's name
ALTER TABLE sales ADD COLUMN sd_id   TEXT NOT NULL DEFAULT '';  -- OSCA / PWD ID number
