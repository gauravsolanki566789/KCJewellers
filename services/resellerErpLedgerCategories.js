const { isErpShopAdmin } = require('./resellerErpOperators');

const DEFAULT_CATEGORIES = [
    { slug: 'metal', label: 'Metal', is_system: true, sort_order: 10 },
    { slug: 'item', label: 'Item', is_system: true, sort_order: 20 },
    { slug: 'repair', label: 'Repair', is_system: true, sort_order: 30 },
    { slug: 'return', label: 'Return', is_system: true, sort_order: 40 },
    { slug: 'sample', label: 'Sample', is_system: true, sort_order: 50 },
    { slug: 'non_metal', label: 'Non metal', is_system: true, sort_order: 60 },
];

function slugify(raw) {
    const s = String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 64);
    if (s === 'nonmetal') return 'non_metal';
    return s;
}

async function ensureLedgerCategorySchema(pool) {
    await pool.query(`
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
        ALTER TABLE reseller_erp_ledger_entries
            ADD COLUMN IF NOT EXISTS ledger_category VARCHAR(64);
        ALTER TABLE reseller_erp_purchase_vouchers
            ADD COLUMN IF NOT EXISTS receipt_no VARCHAR(120);
    `);
}

async function seedDefaultCategories(query, resellerUserId) {
    for (const row of DEFAULT_CATEGORIES) {
        await query(
            `INSERT INTO reseller_erp_ledger_categories
                (reseller_user_id, slug, label, sort_order, is_system)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (reseller_user_id, slug) DO NOTHING`,
            [resellerUserId, row.slug, row.label, row.sort_order, row.is_system],
        );
    }
}

async function listCategories(query, resellerUserId) {
    await seedDefaultCategories(query, resellerUserId);
    const rows = await query(
        `SELECT id, slug, label, sort_order, is_system
         FROM reseller_erp_ledger_categories
         WHERE reseller_user_id = $1
         ORDER BY sort_order ASC, id ASC`,
        [resellerUserId],
    );
    return rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        label: r.label,
        sort_order: r.sort_order,
        is_system: !!r.is_system,
    }));
}

function registerResellerErpLedgerCategoryRoutes(app, { query, pool, checkAuth, requireJson, erpGate }) {
    ensureLedgerCategorySchema(pool).catch((e) =>
        console.warn('ledger categories schema:', e.message),
    );

    app.get('/api/reseller/erp/ledger/categories', checkAuth, erpGate, async (req, res) => {
        try {
            const categories = await listCategories(query, req.user.id);
            res.json({ categories });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to load categories' });
        }
    });

    app.post('/api/reseller/erp/ledger/categories', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const label = String(req.body.label || '').trim().slice(0, 120);
            if (!label) return res.status(400).json({ error: 'Enter a category name' });
            let slug = slugify(req.body.slug || label);
            if (!slug) return res.status(400).json({ error: 'Invalid category name' });
            await seedDefaultCategories(query, req.user.id);
            const max = await query(
                `SELECT COALESCE(MAX(sort_order), 0)::int AS n
                 FROM reseller_erp_ledger_categories WHERE reseller_user_id = $1`,
                [req.user.id],
            );
            const rows = await query(
                `INSERT INTO reseller_erp_ledger_categories
                    (reseller_user_id, slug, label, sort_order, is_system)
                 VALUES ($1, $2, $3, $4, false)
                 RETURNING id, slug, label, sort_order, is_system`,
                [req.user.id, slug, label, (max[0]?.n || 0) + 10],
            );
            res.json({ category: rows[0] });
        } catch (e) {
            if (e.code === '23505') return res.status(409).json({ error: 'That category already exists' });
            res.status(500).json({ error: e.message || 'Failed to add category' });
        }
    });

    app.put('/api/reseller/erp/ledger/categories/:id', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            const id = parseInt(String(req.params.id), 10);
            if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
            const label = String(req.body.label || '').trim().slice(0, 120);
            if (!label) return res.status(400).json({ error: 'Enter a category name' });
            const rows = await query(
                `UPDATE reseller_erp_ledger_categories
                 SET label = $1, updated_at = NOW()
                 WHERE id = $2 AND reseller_user_id = $3
                 RETURNING id, slug, label, sort_order, is_system`,
                [label, id, req.user.id],
            );
            if (!rows.length) return res.status(404).json({ error: 'Not found' });
            res.json({ category: rows[0] });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to update category' });
        }
    });

    app.delete('/api/reseller/erp/ledger/categories/:id', checkAuth, erpGate, async (req, res) => {
        try {
            if (!isErpShopAdmin(req) || !req.session?.shadowUnlocked) {
                return res.status(403).json({ error: 'Delete is only available in Jainav mode.' });
            }
            const id = parseInt(String(req.params.id), 10);
            if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
            const rows = await query(
                `DELETE FROM reseller_erp_ledger_categories
                 WHERE id = $1 AND reseller_user_id = $2
                 RETURNING id, slug`,
                [id, req.user.id],
            );
            if (!rows.length) return res.status(404).json({ error: 'Not found' });
            res.json({ success: true, slug: rows[0].slug });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to delete category' });
        }
    });
}

module.exports = {
    DEFAULT_CATEGORIES,
    slugify,
    listCategories,
    ensureLedgerCategorySchema,
    registerResellerErpLedgerCategoryRoutes,
};