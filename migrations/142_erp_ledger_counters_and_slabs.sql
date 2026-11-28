-- Ledger payment categories, counter openings, slab enable/rename, customer slabs.

CREATE TABLE IF NOT EXISTS reseller_erp_ledger_categories (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slug VARCHAR(64) NOT NULL,
    label VARCHAR(120) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (reseller_user_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_reseller_erp_ledger_categories_reseller
    ON reseller_erp_ledger_categories (reseller_user_id, sort_order, id);

ALTER TABLE reseller_erp_ledger_entries
    ADD COLUMN IF NOT EXISTS ledger_category VARCHAR(64);

ALTER TABLE reseller_erp_purchase_vouchers
    ADD COLUMN IF NOT EXISTS receipt_no VARCHAR(120);

CREATE TABLE IF NOT EXISTS reseller_erp_counter_openings (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    counter_key VARCHAR(32) NOT NULL,
    opening_gm NUMERIC(18, 6) NOT NULL DEFAULT 0,
    opening_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (reseller_user_id, counter_key)
);

CREATE TABLE IF NOT EXISTS reseller_erp_slab_settings (
    reseller_user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    enabled_keys JSONB NOT NULL DEFAULT '["R","R1","W","F","Q"]'::jsonb,
    labels JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reseller_erp_customer_slabs (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    customer_id INTEGER NOT NULL REFERENCES reseller_erp_customers(id) ON DELETE CASCADE,
    metal_type VARCHAR(32) NOT NULL DEFAULT 'Silver',
    style_code VARCHAR(128) NOT NULL,
    sku VARCHAR(128) NOT NULL,
    wastage_pct NUMERIC(12, 4),
    mc_rate NUMERIC(14, 4),
    mc_rate_slab_r NUMERIC(14, 4),
    mc_rate_slab_r1 NUMERIC(14, 4),
    mc_rate_slab_w NUMERIC(14, 4),
    mc_rate_slab_f NUMERIC(14, 4),
    metal_slab_r_pct NUMERIC(12, 6),
    metal_slab_r1_pct NUMERIC(12, 6),
    metal_slab_w_pct NUMERIC(12, 6),
    metal_slab_f_pct NUMERIC(12, 6),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (reseller_user_id, customer_id, metal_type, style_code, sku)
);
CREATE INDEX IF NOT EXISTS idx_reseller_erp_customer_slabs_lookup
    ON reseller_erp_customer_slabs (reseller_user_id, customer_id, style_code, sku);