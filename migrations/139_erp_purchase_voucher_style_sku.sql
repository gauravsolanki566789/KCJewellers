-- Item-category PVs store design-master style + SKU so stock Excel
-- uploads can autofill making charges and other defaults.
ALTER TABLE reseller_erp_purchase_vouchers
  ADD COLUMN IF NOT EXISTS style_code VARCHAR(128);

ALTER TABLE reseller_erp_purchase_vouchers
  ADD COLUMN IF NOT EXISTS sku VARCHAR(128);
