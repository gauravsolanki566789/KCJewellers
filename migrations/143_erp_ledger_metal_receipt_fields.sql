-- Ledger metal receipts: gross weight, purity %, link issue → source receipt.

ALTER TABLE reseller_erp_ledger_entries
  ADD COLUMN IF NOT EXISTS gross_wt_gm NUMERIC(14, 3);

ALTER TABLE reseller_erp_ledger_entries
  ADD COLUMN IF NOT EXISTS metal_pct NUMERIC(8, 4);

ALTER TABLE reseller_erp_ledger_entries
  ADD COLUMN IF NOT EXISTS source_ledger_entry_id INTEGER
  REFERENCES reseller_erp_ledger_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reseller_erp_ledger_source_receipt
  ON reseller_erp_ledger_entries (reseller_user_id, source_ledger_entry_id)
  WHERE source_ledger_entry_id IS NOT NULL;