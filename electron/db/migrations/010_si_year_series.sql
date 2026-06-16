-- 010_si_year_series.sql — per-year Sales Invoice numbering: SI{YYYY}-{NNNNNN}
--
-- The SI series now resets to 1 at the start of each calendar year, e.g.
-- SI2026-000001 … SI2026-000999, then SI2027-000001 on the first sale of 2027.
--
-- `sale_sequence` (seeded in 003) still holds the LAST used number for the
-- CURRENT year; `sale_seq_year` records which year that counter belongs to so
-- the sale handler knows when to roll it back to zero.

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('sale_prefix', 'SI'),
  ('sale_seq_year', strftime('%Y', 'now', 'localtime'));
