import {
  CATALOG_METAL_KEYS,
  type CatalogMetalKey,
} from '@/lib/catalog-metal-family'

export type CatalogMetalScopeRow = {
  has_gold?: boolean
  has_silver?: boolean
  has_diamond?: boolean
  has_gifting?: boolean
  catalog_metals?: CatalogMetalKey[] | null
}

export function parseCatalogMetalsArray(raw: unknown): CatalogMetalKey[] {
  if (!Array.isArray(raw)) return []
  const out: CatalogMetalKey[] = []
  for (const entry of raw) {
    const m = String(entry || '').trim().toLowerCase()
    if (CATALOG_METAL_KEYS.includes(m as CatalogMetalKey) && !out.includes(m as CatalogMetalKey)) {
      out.push(m as CatalogMetalKey)
    }
  }
  return out
}

export function categoryDeclaresMetal(
  cat: CatalogMetalScopeRow,
  metal: CatalogMetalKey,
): boolean {
  const declared = parseCatalogMetalsArray(cat.catalog_metals)
  if (declared.includes(metal)) return true
  if (metal === 'gold') return !!cat.has_gold
  if (metal === 'silver') return !!cat.has_silver
  if (metal === 'diamond') return !!cat.has_diamond
  if (metal === 'gifting') return !!cat.has_gifting
  return false
}

export function subcategoryHasProductMetal(
  sub: {
    has_gold?: boolean
    has_silver?: boolean
    has_diamond?: boolean
    has_gifting?: boolean
    product_count?: number
  },
): boolean {
  return !!(
    sub.has_gold ||
    sub.has_silver ||
    sub.has_diamond ||
    sub.has_gifting ||
    (sub.product_count ?? 0) > 0
  )
}

export function subcategoryMatchesMetalTab(
  sub: {
    has_gold?: boolean
    has_silver?: boolean
    has_diamond?: boolean
    has_gifting?: boolean
    product_count?: number
  },
  metal: CatalogMetalKey,
  cat?: CatalogMetalScopeRow,
): boolean {
  const hasMeta =
    sub.has_gold !== undefined ||
    sub.has_silver !== undefined ||
    sub.has_diamond !== undefined ||
    sub.has_gifting !== undefined

  if (hasMeta) {
    if (metal === 'gold' && sub.has_gold) return true
    if (metal === 'silver' && sub.has_silver) return true
    if (metal === 'diamond' && sub.has_diamond) return true
    if (metal === 'gifting' && sub.has_gifting) return true
  } else if (!hasMeta) {
    return true
  }

  if (cat && categoryDeclaresMetal(cat, metal) && !subcategoryHasProductMetal(sub)) {
    return true
  }
  return false
}