import type { ErpRateSlab } from '@/lib/erp-billing-pricing'
import { ERP_BILLING_SLAB_OPTIONS } from '@/lib/erp-billing-pricing'

export const ERP_SLAB_KEYS: ErpRateSlab[] = ['R', 'R1', 'W', 'F', 'Q']

export const DEFAULT_ERP_SLAB_LABELS: Record<ErpRateSlab, string> = {
  R: 'R',
  R1: 'R1',
  W: 'W',
  F: 'F',
  Q: 'RQUOTE',
}

export type ErpSlabSettings = {
  enabled_keys: ErpRateSlab[]
  labels: Record<ErpRateSlab, string>
}

export function parseErpSlabSettings(raw: unknown): ErpSlabSettings {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const keysRaw = Array.isArray(obj.enabled_keys) ? obj.enabled_keys : ERP_SLAB_KEYS
  const enabled: ErpRateSlab[] = []
  for (const k of keysRaw) {
    const n = String(k || '').trim().toUpperCase().replace(/^SLAB\s*/, '')
    const key: ErpRateSlab | null =
      n === 'Q' || n === 'RQUOTE' || n === 'RQ'
        ? 'Q'
        : n === 'R1'
          ? 'R1'
          : n === 'W' || n === 'WHOLESALE'
            ? 'W'
            : n === 'F'
              ? 'F'
              : n === 'R'
                ? 'R'
                : null
    if (key && !enabled.includes(key)) enabled.push(key)
  }
  const labelsIn = obj.labels && typeof obj.labels === 'object' ? (obj.labels as Record<string, unknown>) : {}
  const labels = { ...DEFAULT_ERP_SLAB_LABELS }
  for (const key of ERP_SLAB_KEYS) {
    const v = String(labelsIn[key] || '').trim().slice(0, 40)
    if (v) labels[key] = v
  }
  return {
    enabled_keys: enabled.length ? enabled : [...ERP_SLAB_KEYS],
    labels,
  }
}

export function slabLabel(key: ErpRateSlab, labels?: Record<string, string> | null): string {
  const v = String(labels?.[key] || '').trim()
  return v || DEFAULT_ERP_SLAB_LABELS[key]
}

export function billingSlabOptions(settings?: ErpSlabSettings | null): { value: ErpRateSlab; label: string }[] {
  const enabled = settings?.enabled_keys?.length ? settings.enabled_keys : ERP_SLAB_KEYS
  return ERP_BILLING_SLAB_OPTIONS.filter((o) => enabled.includes(o.value)).map((o) => ({
    value: o.value,
    label: slabLabel(o.value, settings?.labels),
  }))
}

const MC_FIELD_TO_SLAB: Record<string, ErpRateSlab> = {
  mc_rate_slab_r: 'R',
  mc_rate_slab_r1: 'R1',
  mc_rate_slab_w: 'W',
  mc_rate_slab_f: 'F',
  metal_slab_r_pct: 'R',
  metal_slab_r1_pct: 'R1',
  metal_slab_w_pct: 'W',
  metal_slab_f_pct: 'F',
}

export function isSlabRelatedFieldKey(fieldKey: string): boolean {
  return fieldKey in MC_FIELD_TO_SLAB || fieldKey === 'wastage_pct' || fieldKey === 'mc_rate'
}

export function slabRelatedFieldLabel(fieldKey: string, labels?: Record<string, string> | null): string {
  const slab = MC_FIELD_TO_SLAB[fieldKey]
  if (!slab) {
    if (fieldKey === 'wastage_pct') return 'Wast %'
    if (fieldKey === 'mc_rate') return 'MC'
    return fieldKey
  }
  const name = slabLabel(slab, labels)
  if (fieldKey.startsWith('metal_')) return `Met ${name}%`
  return `MC ${name}`
}

export function formatSlabRateValue(v: unknown): string {
  if (v == null || v === '') return '—'
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  if (Number.isInteger(n)) return String(n)
  return String(parseFloat(n.toFixed(4)))
}
