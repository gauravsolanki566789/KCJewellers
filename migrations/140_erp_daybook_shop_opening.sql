-- Shop-level day book opening (admin sets once). Later days carry closing → opening.
CREATE TABLE IF NOT EXISTS reseller_erp_daybook_openings (
    id SERIAL PRIMARY KEY,
    reseller_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ledger_scope VARCHAR(16) NOT NULL DEFAULT 'official',
    opening_date DATE NOT NULL,
    opening_inr NUMERIC(14, 2) NOT NULL DEFAULT 0,
    opening_metal_gm NUMERIC(16, 6) NOT NULL DEFAULT 0,
    jewellery_metal VARCHAR(16),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (reseller_user_id, ledger_scope)
);

CREATE INDEX IF NOT EXISTS idx_reseller_erp_daybook_openings_reseller
    ON reseller_erp_daybook_openings (reseller_user_id, ledger_scope);
