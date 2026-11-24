-- Declared catalogue metals for styles with zero products (Kumudu / reseller scope).
ALTER TABLE web_categories
    ADD COLUMN IF NOT EXISTS catalog_metals JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill from reseller allowed_category_metals JSON keys.
UPDATE web_categories wc
SET catalog_metals = sub.metals
FROM (
    SELECT wc2.id AS category_id,
           COALESCE(
               jsonb_agg(DISTINCT metal ORDER BY metal) FILTER (WHERE metal IS NOT NULL),
               '[]'::jsonb
           ) AS metals
    FROM web_categories wc2
    LEFT JOIN users u ON u.allowed_category_ids @> ARRAY[wc2.id]
    LEFT JOIN LATERAL jsonb_array_elements_text(
        COALESCE(u.allowed_category_metals -> (wc2.id::text), '[]'::jsonb)
    ) AS metal ON true
    GROUP BY wc2.id
) sub
WHERE wc.id = sub.category_id
  AND jsonb_array_length(COALESCE(wc.catalog_metals, '[]'::jsonb)) = 0
  AND jsonb_array_length(COALESCE(sub.metals, '[]'::jsonb)) > 0;

-- Categories only on allowed_category_ids with no metal map → default gold (matches B2B picker).
UPDATE web_categories wc
SET catalog_metals = '["gold"]'::jsonb
WHERE jsonb_array_length(COALESCE(wc.catalog_metals, '[]'::jsonb)) = 0
  AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.allowed_category_ids @> ARRAY[wc.id]
  );