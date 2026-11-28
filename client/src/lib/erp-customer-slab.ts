import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'

export type CustomerSlabRow = {
  id?: number
  customer_id: number
  customer_name?: string | null
  customer_mobile?: string | null
  metal_type: string
  style_code: string
  sku: string
  wastage_pct?: number | null
  mc_rate?: number | null
  mc_rate_slab_r?: number | null
  mc_rate_slab_r1?: number | null
  mc_rate_slab_w?: number | null
  mc_rate_slab_f?: number | null
  metal_slab_r_pct?: number | null
  metal_slab_r1_pct?: number | null
  metal_slab_w_pct?: number | null
  metal_slab_f_pct?: number | null
}

function norm(v: unknown): string {
  return String(v || '').trim().toUpperCase()
}

function metalKey(v: unknown): string {
  const s = String(v || '').toLowerCase()
  if (s.includes('gold')) return 'GOLD'
  if (s.includes('silver')) return 'SILVER'
  return s.toUpperCase()
}

export function matchCustomerSlab(
  line: Pick<ErpBillLine, 'style_code' | 'sku' | 'metal_type'>,
  rows: CustomerSlabRow[] | null | undefined,
): CustomerSlabRow | null {
  if (!rows?.length) return null
  const style = norm(line.style_code)
  const sku = norm(line.sku)
  if (!style || !sku) return null
  const metal = metalKey(line.metal_type)
  return (
    rows.find(
      (r) =>
        norm(r.style_code) === style &&
        norm(r.sku) === sku &&
        (!r.metal_type || metalKey(r.metal_type) === metal || metalKey(r.metal_type) === ''),
    ) || null
  )
}

function pickNum(override: number | null | undefined, fallback: number | null | undefined): number | null {
  if (override != null && Number.isFinite(Number(override))) return Number(override)
  return fallback ?? null
}

/** Customer slab wins when set; otherwise keep design-master / stock values. */
export function applyCustomerSlabToLine(line: ErpBillLine, row: CustomerSlabRow | null): ErpBillLine {
  if (!row) return line
  return {
    ...line,
    wastage_pct: pickNum(row.wastage_pct, line.wastage_pct),
    mc_rate: pickNum(row.mc_rate, line.mc_rate),
    mc_rate_catalog: pickNum(row.mc_rate, line.mc_rate_catalog ?? line.mc_rate),
    mc_rate_slab_r: pickNum(row.mc_rate_slab_r, line.mc_rate_slab_r),
    mc_rate_slab_r1: pickNum(row.mc_rate_slab_r1, line.mc_rate_slab_r1),
    mc_rate_slab_w: pickNum(row.mc_rate_slab_w, line.mc_rate_slab_w),
    mc_rate_slab_f: pickNum(row.mc_rate_slab_f, line.mc_rate_slab_f),
    metal_slab_r_pct: pickNum(row.metal_slab_r_pct, line.metal_slab_r_pct),
    metal_slab_r1_pct: pickNum(row.metal_slab_r1_pct, line.metal_slab_r1_pct),
    metal_slab_w_pct: pickNum(row.metal_slab_w_pct, line.metal_slab_w_pct),
    metal_slab_f_pct: pickNum(row.metal_slab_f_pct, line.metal_slab_f_pct),
  }
}

export function overlayCustomerSlabsOnLine(
  line: ErpBillLine,
  rows: CustomerSlabRow[] | null | undefined,
): ErpBillLine {
  return applyCustomerSlabToLine(line, matchCustomerSlab(line, rows))
}
