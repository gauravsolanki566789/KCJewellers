const { isErpShopAdmin } = require('./resellerErpOperators');
const { loadJewelleryLedgerMetalEnabled } = require('./erpJewelleryLedgerSettings');
const { normalizeJewelleryMetal } = require('./erpLedgerMetal');

const COUNTERS = ['metal', 'item', 'approval', 'stock'];
const JEWELLERY_METALS = new Set(['gold', 'silver']);

function gm(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return 0;
    return v;
}

function isoDate(raw, fallback) {
    const s = String(raw || '').trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return fallback;
}

function addDaysIso(iso, n) {
    const parts = String(iso || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some((x) => !Number.isFinite(x))) return iso;
    const dt = new Date(parts[0], parts[1] - 1, parts[2] + n);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

async function ensureCounterOpeningSchema(pool) {
    await pool.query(`
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
    `);
}

function linesWeightGm(lines) {
    let arr = lines;
    if (typeof arr === 'string') {
        try {
            arr = JSON.parse(arr);
        } catch {
            arr = [];
        }
    }
    if (!Array.isArray(arr)) return 0;
    let t = 0;
    for (const line of arr) {
        t += gm(line.originalWeightGm ?? line.weightGm ?? line.weight_gm ?? line.net_weight ?? line.avg_weight);
    }
    return t;
}

async function counterMovements(query, resellerUserId, from, to, jewelleryMetalFilter) {
    const jm = normalizeJewelleryMetal(jewelleryMetalFilter);
    const params = [resellerUserId, from, to];
    let catSql = `LOWER(TRIM(COALESCE(ledger_category, ''))) IN ('metal', 'item')`;
    if (jm && JEWELLERY_METALS.has(jm)) {
        params.push(jm);
        catSql = `(
            LOWER(TRIM(COALESCE(ledger_category, ''))) = 'item'
            OR (
                LOWER(TRIM(COALESCE(ledger_category, ''))) = 'metal'
                AND LOWER(TRIM(COALESCE(jewellery_metal, 'silver'))) = $${params.length}
            )
        )`;
    }
    const metalItem = await query(
        `
        SELECT
            LOWER(TRIM(COALESCE(ledger_category, ''))) AS cat,
            COALESCE(SUM(ABS(COALESCE(metal_gm, 0))) FILTER (
                WHERE entry_type IN ('payment_in', 'purchase', 'opening', 'suspense_in')
                  AND COALESCE(fixed_asset_metal, false) = false
            ), 0)::float AS receipt_gm,
            COALESCE(SUM(ABS(COALESCE(metal_gm, 0))) FILTER (
                WHERE entry_type IN ('payment_out', 'expense')
                  AND COALESCE(fixed_asset_metal, false) = false
            ), 0)::float AS issue_gm
        FROM reseller_erp_ledger_entries
        WHERE reseller_user_id = $1
          AND COALESCE(ledger_scope, 'official') = 'official'
          AND entry_date >= $2::date
          AND entry_date <= $3::date
          AND ${catSql}
        GROUP BY 1
        `,
        params,
    );

    const byCat = { metal: { receipt: 0, issue: 0 }, item: { receipt: 0, issue: 0 } };
    for (const r of metalItem) {
        const k = r.cat === 'item' ? 'item' : 'metal';
        byCat[k].receipt += gm(r.receipt_gm);
        byCat[k].issue += gm(r.issue_gm);
    }
    /* PV grams already sit on the linked purchase ledger row — do not double-count. */

    const approvals = await query(
        `SELECT id, status, bill_date, created_at, updated_at, lines_json
         FROM reseller_erp_bills
         WHERE reseller_user_id = $1 AND bill_type = 'approval'`,
        [resellerUserId],
    );
    let approvalReceipt = 0;
    let approvalIssue = 0;
    for (const b of approvals) {
        const wt = linesWeightGm(b.lines_json);
        const created = String(b.bill_date || b.created_at || '').slice(0, 10);
        const updated = String(b.updated_at || '').slice(0, 10);
        const st = String(b.status || '').toLowerCase();
        if (created >= from && created <= to) approvalReceipt += wt;
        const closed = st === 'billed' || st === 'returned' || st === 'cancelled' || st === 'converted';
        if (closed && updated >= from && updated <= to) approvalIssue += wt;
    }

    const stock = await query(
        `
        SELECT
            COALESCE(SUM(COALESCE(avg_weight, 0) * COALESCE(pcs, 1)) FILTER (
                WHERE created_at::date >= $2::date AND created_at::date <= $3::date
            ), 0)::float AS receipt_gm,
            COALESCE(SUM(COALESCE(avg_weight, 0) * COALESCE(pcs, 1)) FILTER (
                WHERE LOWER(status) = 'sold'
                  AND updated_at::date >= $2::date AND updated_at::date <= $3::date
            ), 0)::float AS issue_gm
        FROM reseller_erp_stock_pieces
        WHERE reseller_user_id = $1
        `,
        [resellerUserId, from, to],
    );

    return {
        metal: byCat.metal,
        item: byCat.item,
        approval: { receipt: approvalReceipt, issue: approvalIssue },
        stock: { receipt: gm(stock[0]?.receipt_gm), issue: gm(stock[0]?.issue_gm) },
    };
}

async function loadOpenings(query, resellerUserId) {
    const rows = await query(
        `SELECT counter_key, opening_gm, opening_date
         FROM reseller_erp_counter_openings WHERE reseller_user_id = $1`,
        [resellerUserId],
    );
    const map = {};
    for (const r of rows) {
        map[String(r.counter_key)] = {
            opening_gm: gm(r.opening_gm),
            opening_date: String(r.opening_date).slice(0, 10),
        };
    }
    return map;
}

function metalCounterLabel(baseKey, jewelleryMetal) {
    const jm = normalizeJewelleryMetal(jewelleryMetal);
    if (baseKey === 'metal' && jm && JEWELLERY_METALS.has(jm)) {
        return `metal ${jm}`;
    }
    return baseKey;
}

function openingKeyForCounter(baseKey, jewelleryMetal) {
    const jm = normalizeJewelleryMetal(jewelleryMetal);
    if (baseKey === 'metal' && jm && JEWELLERY_METALS.has(jm)) {
        return `metal_${jm}`;
    }
    return baseKey;
}

async function buildCounterReport(query, resellerUserId, from, to, opts = {}) {
    const jewelleryMetal = normalizeJewelleryMetal(opts.jewelleryMetal);
    const openings = await loadOpenings(query, resellerUserId);
    const rows = [];
    for (const key of COUNTERS) {
        const openKey = openingKeyForCounter(key, jewelleryMetal);
        const open =
            openings[openKey] ||
            (key === 'metal' ? openings[key] : null) ||
            { opening_gm: 0, opening_date: from };
        const start = open.opening_date && open.opening_date < from ? open.opening_date : from;
        const beforeTo = from > start
            ? await counterMovements(query, resellerUserId, start, addDaysIso(from, -1), jewelleryMetal)
            : null;
        const period = await counterMovements(query, resellerUserId, from, to, jewelleryMetal);
        const mvBefore = beforeTo && from > start ? beforeTo[key] : { receipt: 0, issue: 0 };
        const mv = period[key];
        const opening = gm(open.opening_gm) + gm(mvBefore.receipt) - gm(mvBefore.issue);
        const receipt = gm(mv.receipt);
        const issue = gm(mv.issue);
        rows.push({
            counter: metalCounterLabel(key, jewelleryMetal),
            opening,
            receipt,
            issue,
            closing: opening + receipt - issue,
            opening_date: open.opening_date || null,
            counter_key: key,
            opening_store_key: openKey,
        });
    }
    const total = rows.reduce(
        (acc, r) => ({
            opening: acc.opening + r.opening,
            receipt: acc.receipt + r.receipt,
            issue: acc.issue + r.issue,
            closing: acc.closing + r.closing,
        }),
        { opening: 0, receipt: 0, issue: 0, closing: 0 },
    );
    return { from, to, rows, total, openings, jewellery_metal: jewelleryMetal || null };
}

function registerResellerErpCounterReportRoutes(app, { query, pool, checkAuth, requireJson, erpGate }) {
    ensureCounterOpeningSchema(pool).catch((e) => console.warn('counter openings schema:', e.message));

    app.get('/api/reseller/erp/ledger/reports/counter-wise', checkAuth, erpGate, async (req, res) => {
        try {
            if (!(await loadJewelleryLedgerMetalEnabled(query, req.user.id))) {
                return res.status(403).json({ error: 'Turn on Ledger in metal under Print formats → Templates' });
            }
            const today = new Date().toISOString().slice(0, 10);
            const from = isoDate(req.query.from, today);
            const to = isoDate(req.query.to, today);
            const jewelleryMetal = normalizeJewelleryMetal(
                req.query.jewellery_metal || req.query.jewelleryMetal || req.query.metal,
            );
            const report = await buildCounterReport(query, req.user.id, from, to, {
                jewelleryMetal,
            });
            res.json(report);
        } catch (e) {
            console.error('counter-wise report:', e);
            res.status(500).json({ error: e.message || 'Failed to load counter report' });
        }
    });

    app.get('/api/reseller/erp/ledger/counter-openings', checkAuth, erpGate, async (req, res) => {
        try {
            const openings = await loadOpenings(query, req.user.id);
            res.json({ openings });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to load openings' });
        }
    });

    app.put('/api/reseller/erp/ledger/counter-openings', checkAuth, erpGate, requireJson, async (req, res) => {
        try {
            if (!isErpShopAdmin(req)) {
                return res.status(403).json({ error: 'Only an ERP admin can set counter openings.' });
            }
            const key = String(req.body.counter_key || '').trim().toLowerCase();
            const allowed = [...COUNTERS, 'metal_silver', 'metal_gold'];
            if (!allowed.includes(key)) return res.status(400).json({ error: 'Invalid counter' });
            const openingGm = gm(req.body.opening_gm);
            const openingDate = isoDate(req.body.opening_date, new Date().toISOString().slice(0, 10));
            const rows = await query(
                `INSERT INTO reseller_erp_counter_openings
                    (reseller_user_id, counter_key, opening_gm, opening_date, updated_at)
                 VALUES ($1, $2, $3, $4::date, NOW())
                 ON CONFLICT (reseller_user_id, counter_key)
                 DO UPDATE SET opening_gm = EXCLUDED.opening_gm, opening_date = EXCLUDED.opening_date, updated_at = NOW()
                 RETURNING counter_key, opening_gm, opening_date`,
                [req.user.id, key, openingGm, openingDate],
            );
            res.json({ opening: rows[0] });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to save opening' });
        }
    });

    app.delete('/api/reseller/erp/ledger/counter-openings/:key', checkAuth, erpGate, async (req, res) => {
        try {
            if (!isErpShopAdmin(req) || !req.session?.shadowUnlocked) {
                return res.status(403).json({ error: 'Delete is only available in Jainav mode.' });
            }
            const key = String(req.params.key || '').trim().toLowerCase();
            await query(
                `DELETE FROM reseller_erp_counter_openings WHERE reseller_user_id = $1 AND counter_key = $2`,
                [req.user.id, key],
            );
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message || 'Failed to delete opening' });
        }
    });
}

module.exports = {
    COUNTERS,
    registerResellerErpCounterReportRoutes,
};