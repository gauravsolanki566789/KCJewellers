import type { ErpBillLine } from '@/components/reseller/erp/erp-ui'
import { isMcPerPiece } from '@/lib/pricing'
import { pieceSlabMcRate } from '@/lib/erp-piece-slab-pricing'
import { erpMcBillingWeightGm } from '@/lib/erp-manual-as-line-pricing'
import { erpLineNetWeightGm } from '@/lib/erp-metal-slab-field'
import type { ErpRateSlab } from '@/lib/erp-billing-pricing'
import { isMcPerGmBillingType } from '@/lib/erp-mc-type-field'

/** Job-work invoice GST: 2.5% + 2.5% intra, 5% IGST inter. */
export const JOB_WORK_GST_PCT = 5
export const JOB_WORK_CGST_PCT = 2.5
export const JOB_WORK_SGST_PCT = 2.5
export const JOB_WORK_IGST_PCT = 5

export const DEFAULT_JOB_WORK_ITEM = {
  name: 'JOB WORK CHARGES RECEIVED',
  hsn: '998537',
}

export type ErpBillKind = 'amount' | 'metal'

export function findJobWorkInvoiceItem(
  items?: { name?: string; hsn?: string }[] | null,
): { name: string; hsn: string } {
  const hit = (items || []).find((it) => /job\s*work/i.test(String(it.name || '')))
  if (hit?.name?.trim()) {
    return {
      name: hit.name.trim(),
      hsn: String(hit.hsn || '').trim() || DEFAULT_JOB_WORK_ITEM.hsn,
    }
  }
  return { ...DEFAULT_JOB_WORK_ITEM }
}

export function isMetalBillSession(session: unknown): boolean {
  const s = session && typeof session === 'object' ? (session as Record<string, unknown>) : {}
  return s.metal_bill === true || s.metalBill === true
}

export function exactLineMcRate(line: ErpBillLine, slab: ErpRateSlab): number {
  const slabMc = pieceSlabMcRate(line, slab)
  if (slabMc != null && Number.isFinite(Number(slabMc)) && Number(slabMc) > 0) return Number(slabMc)
  const r = Number(line.mc_rate)
  return Number.isFinite(r) && r > 0 ? r : 0
}

export function exactLineMcInr(line: ErpBillLine, slab: ErpRateSlab): number {
  const rate = exactLineMcRate(line, slab)
  if (rate <= 0) return 0
  const qty = Math.max(1, Number(line.qty) || 1)
  if (isMcPerPiece(line.mc_type) || !isMcPerGmBillingType(line.mc_type)) {
    return Math.round(rate * qty * 100) / 100
  }
  const wt = erpMcBillingWeightGm(line, slab) || erpLineNetWeightGm(line, slab)
  if (wt <= 0) return 0
  return Math.round(rate * wt * qty * 100) / 100
}

export function exactLineWeightGm(line: ErpBillLine, slab: ErpRateSlab): number {
  return erpLineNetWeightGm(line, slab) || Number(line.originalWeightGm ?? line.weightGm) || 0
}

export type MetalBillSummary = {
  weightGm: number
  mcInr: number
  gstPct: number
  gstInr: number
  rawTotal: number
  roundedTotal: number
  roundOff: number
}

export function computeMetalBillSummary(opts: {
  lines: ErpBillLine[]
  slab: ErpRateSlab
  gstOn: boolean
  interstate?: boolean
}): MetalBillSummary {
  let weightGm = 0
  let mcInr = 0
  for (const line of opts.lines) {
    weightGm += exactLineWeightGm(line, opts.slab)
    mcInr += exactLineMcInr(line, opts.slab)
  }
  weightGm = Math.round(weightGm * 1000) / 1000
  mcInr = Math.round(mcInr * 100) / 100
  const gstPct = !opts.gstOn ? 0 : JOB_WORK_GST_PCT
  const gstInr = Math.round(mcInr * (gstPct / 100) * 100) / 100
  const rawTotal = Math.round((mcInr + gstInr) * 100) / 100
  const roundedTotal = Math.round(rawTotal)
  const roundOff = Math.round((roundedTotal - rawTotal) * 100) / 100
  return { weightGm, mcInr, gstPct, gstInr, rawTotal, roundedTotal, roundOff }
}

export function metalBillJobWorkFromSession(session: unknown): { name: string; hsn: string } {
  const s = session && typeof session === 'object' ? (session as Record<string, unknown>) : {}
  const name = String(s.metalBillItemName || '').trim()
  const hsn = String(s.metalBillHsn || '').trim()
  return {
    name: name || DEFAULT_JOB_WORK_ITEM.name,
    hsn: hsn || DEFAULT_JOB_WORK_ITEM.hsn,
  }
}
