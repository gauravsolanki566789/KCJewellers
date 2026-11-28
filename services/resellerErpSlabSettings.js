const { isErpShopAdmin } = require('./resellerErpOperators');

const SLAB_KEYS = ['R', 'R1', 'W', 'F', 'Q'];
const DEFAULT_LABELS = { R: 'R', R1: 'R1', W: 'W', F: 'F', Q: 'RQUOTE' };

function normalizeKey(raw) {
    const s = String(raw || '').trim().toUpperCase().replace(/^SLAB\s*/, '');
    if (s === 'Q' || s === 'RQUOTE' || s === 'RQ') return 'Q';
    if (s === 'R1') return 'R1';
    if (s === 'W' || s === 'WHOLESALE') return 'W';
    if (s === 'F') return 'F';
    if (s === 'R') return 'R';
    return null;
}

function parseEnabled(raw) {
    const arr = Array.isArray(raw) ? raw : [];
    const out = [];
    for (const k of arr) {
        const n = normalizeKey(k);
        if (n && SLAB_KEYS.includes(n) && !out.includes(n)) out.push(n);
    }
    return out.length ? out : [...SLAB_KEYS];
}

function parseLabels(raw) {
    const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const out = { ...DEFAULT_LABELS };
    for (const key of SLAB_KEYS) {
        const v = String(obj[key] || '').trim().slice(0, 40);
        if (v) out[key] = v;
    }
    return out;
}

function mapSettings(row) {
    return {
        enabled_keys: parseEnabled(row?.enabled_keys),
        labels: parseLabels(row?.labels),
    };
}

function numOrNull(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function mapCustomerSlab(row) {
    if (!row) return null;
    return {
        id: row.id,
        customer_id: row.customer_id,
        customer_name: row.customer_name || null,
        customer_mobile: row.customer_mobile || null,
        metal_type: row.metal_type,
        style_code: row.style_code,
        sku: row.sku,
        wastage_pct: row.wastage_pct != null ? Number(row.wastage_pct) : null,
        mc_rate: row.mc_rate != null ? Number(row.mc_rate) : null,
        mc_rate_slab_r: row.mc_rate_slab_r != null ? Number(row.mc_rate_slab_r) : null,
        mc_rate_slab_r1: row.mc_rate_slab_r1 != null ? Number(row.mc_rate_slab_r1) : null,
        mc_rate_slab_w: row.mc_rate_slab_w != null ? Number(row.mc_rate_slab_w) : null,
        mc_rate_slab_f: row.mc_rate_slab_f != null ? Number(row.mc_rate_slab_f) : null,
        metal_slab_r_pct: row.metal_slab_r_pct != null ? Number(row.metal_slab_r_pct) : null,
        metal_slab_r1_pct: row.metal_slab_r1_pct != null ? Number(row.metal_slab_r1_pct) : null,
        metal_slab_w_pct: row.metal_slab_w_pct != null ? Number(row.metal_slab_w_pct) : null,
        metal_slab_f_pct: row.metal_slab_f_pct != null ? Number(row.metal_slab_f_pct) : null,
        updated_at: row.updated_at,
    };
}

async function ensureSlabSettingsSchema(pool) {
    await pool.query(`
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
    `);
}

async function loadSlabSettings(query, resellerUserId) {
    const rows = await query(
        `SELECT enabled_keys, labels FROM reseller_erp_slab_settings WHERE reseller_user_id = $1`,
        [resellerUserId],
    );
    return mapSettings(rows[0]);
}

function registerResellerErpSlabSettingsRoutes(app, { query, pool, checkAuth, requireJson, erpGate }) {
    ensureSlabSettingsSchema(pool).catch((e) => console.warn('slab settings schema:', e.message));

    app.get('/api/reseller/erp/slab-settings', checkAuth, erpGate, async (req, res) => {
        try {
            res.json(await loadSlabSettings(query, req.user.id));
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to load slabs' });
        }
    });

    app.put('/api/reseller/erp/slab-settings', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const enabled = parseEnabled(req.body.enabled_keys);
            const labels = parseLabels(req.body.labels);
            const rows = await query(
                `INSERT INTO reseller_erp_slab_settings (reseller_user_id, enabled_keys, labels, updated_at)
                 VALUES ($1, $2::jsonb, $3::jsonb, NOW())
                 ON CONFLICT (reseller_user_id)
                 DO UPDATE SET enabled_keys = EXCLUDED.enabled_keys, labels = EXCLUDED.labels, updated_at = NOW()
                 RETURNING enabled_keys, labels`,
                [req.user.id, JSON.stringify(enabled), JSON.stringify(labels)],
            );
            res.json(mapSettings(rows[0]));
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to save slabs' });
        }
    });

    app.get('/api/reseller/erp/customer-slabs', checkAuth, erpGate, async (req, res) => {
        try {
            const customerId = parseInt(String(req.query.customer_id || ''), 10);
            const params = [req.user.id];
            let sql = `
                SELECT cs.*, c.name AS customer_name, c.mobile AS customer_mobile
                FROM reseller_erp_customer_slabs cs
                LEFT JOIN reseller_erp_customers c ON c.id = cs.customer_id
                WHERE cs.reseller_user_id = $1`;
            if (Number.isFinite(customerId) && customerId > 0) {
                params.push(customerId);
                sql += ` AND cs.customer_id = $2`;
            }
            sql += ` ORDER BY c.name, cs.metal_type, cs.style_code, cs.sku`;
            const rows = await query(sql, params);
            res.json({ rows: rows.map(mapCustomerSlab) });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to load customer slabs' });
        }
    });

    app.get('/api/reseller/erp/customer-slabs/lookup', checkAuth, erpGate, async (req, res) => {
        try {
            const customerId = parseInt(String(req.query.customer_id || ''), 10);
            const style = String(req.query.style_code || '').trim();
            const sku = String(req.query.sku || '').trim();
            const metal = String(req.query.metal_type || '').trim() || 'Silver';
            if (!Number.isFinite(customerId) || !style || !sku) {
                return res.json({ row: null });
            }
            const rows = await query(
                `SELECT cs.*, c.name AS customer_name, c.mobile AS customer_mobile
                 FROM reseller_erp_customer_slabs cs
                 LEFT JOIN reseller_erp_customers c ON c.id = cs.customer_id
                 WHERE cs.reseller_user_id = $1 AND cs.customer_id = $2
                   AND LOWER(TRIM(cs.style_code)) = LOWER(TRIM($3))
                   AND LOWER(TRIM(cs.sku)) = LOWER(TRIM($4))
                   AND LOWER(TRIM(cs.metal_type)) = LOWER(TRIM($5))
                 LIMIT 1`,
                [req.user.id, customerId, style, sku, metal],
            );
            res.json({ row: mapCustomerSlab(rows[0]) });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Lookup failed' });
        }
    });

    app.put('/api/reseller/erp/customer-slabs', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const customerId = parseInt(String(req.body.customer_id || ''), 10);
            const style = String(req.body.style_code || '').trim().slice(0, 128);
            const sku = String(req.body.sku || '').trim().slice(0, 128);
            const metal = String(req.body.metal_type || 'Silver').trim().slice(0, 32) || 'Silver';
            if (!Number.isFinite(customerId) || customerId <= 0) {
                return res.status(400).json({ error: 'Select a customer' });
            }
            if (!style || !sku) return res.status(400).json({ error: 'Select style and SKU' });
            const rows = await query(
                `INSERT INTO reseller_erp_customer_slabs (
                    reseller_user_id, customer_id, metal_type, style_code, sku,
                    wastage_pct, mc_rate, mc_rate_slab_r, mc_rate_slab_r1, mc_rate_slab_w, mc_rate_slab_f,
                    metal_slab_r_pct, metal_slab_r1_pct, metal_slab_w_pct, metal_slab_f_pct, updated_at
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
                 ON CONFLICT (reseller_user_id, customer_id, metal_type, style_code, sku)
                 DO UPDATE SET
                    wastage_pct = EXCLUDED.wastage_pct,
                    mc_rate = EXCLUDED.mc_rate,
                    mc_rate_slab_r = EXCLUDED.mc_rate_slab_r,
                    mc_rate_slab_r1 = EXCLUDED.mc_rate_slab_r1,
                    mc_rate_slab_w = EXCLUDED.mc_rate_slab_w,
                    mc_rate_slab_f = EXCLUDED.mc_rate_slab_f,
                    metal_slab_r_pct = EXCLUDED.metal_slab_r_pct,
                    metal_slab_r1_pct = EXCLUDED.metal_slab_r1_pct,
                    metal_slab_w_pct = EXCLUDED.metal_slab_w_pct,
                    metal_slab_f_pct = EXCLUDED.metal_slab_f_pct,
                    updated_at = NOW()
                 RETURNING *`,
                [
                    req.user.id,
                    customerId,
                    metal,
                    style,
                    sku,
                    numOrNull(req.body.wastage_pct),
                    numOrNull(req.body.mc_rate),
                    numOrNull(req.body.mc_rate_slab_r),
                    numOrNull(req.body.mc_rate_slab_r1),
                    numOrNull(req.body.mc_rate_slab_w),
                    numOrNull(req.body.mc_rate_slab_f),
                    numOrNull(req.body.metal_slab_r_pct),
                    numOrNull(req.body.metal_slab_r1_pct),
                    numOrNull(req.body.metal_slab_w_pct),
                    numOrNull(req.body.metal_slab_f_pct),
                ],
            );
            res.json({ row: mapCustomerSlab(rows[0]) });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to save customer slab' });
        }
    });

    app.delete('/api/reseller/erp/customer-slabs/:id', checkAuth, erpGate, async (req, res) => {
        try {
            if (!isErpShopAdmin(req) || !req.session?.shadowUnlocked) {
                return res.status(403).json({ error: 'Delete is only available in Jainav mode.' });
            }
            const id = parseInt(String(req.params.id), 10);
            const rows = await query(
                `DELETE FROM reseller_erp_customer_slabs WHERE id = $1 AND reseller_user_id = $2 RETURNING id`,
                [id, req.user.id],
            );
            if (!rows.length) return res.status(404).json({ error: 'Not found' });
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to delete' });
        }
    });
}

module.exports = {
    SLAB_KEYS,
    DEFAULT_LABELS,
    loadSlabSettings,
    registerResellerErpSlabSettingsRoutes,
};