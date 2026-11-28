'use client'

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import axios from '@/lib/axios'
import { Check, Loader2, Plus, Search, Trash2 } from 'lucide-react'
import {
  erpBtnGhost,
  erpBtnPrimary,
  erpCardCls,
  erpErr,
  erpInputCls,
  type ErpCustomer,
} from '@/components/reseller/erp/erp-ui'
import { ErpBillingSuggestField } from '@/components/reseller/erp/ErpBillingSuggestField'
import { useErpOperator } from '@/context/ErpOperatorContext'
import { useErpSlabSettings } from '@/hooks/useErpSlabSettings'
import {
  DEFAULT_ERP_SLAB_LABELS,
  ERP_SLAB_KEYS,
  formatSlabRateValue,
  parseErpSlabSettings,
  slabRelatedFieldLabel,
} from '@/lib/erp-slab-settings'
import type { ErpRateSlab } from '@/lib/erp-billing-pricing'
import type { CustomerSlabRow } from '@/lib/erp-customer-slab'
import { appAlert, appConfirm } from '@/lib/app-notice'
import { DESIGN_METAL_TYPE_OPTIONS } from '@/lib/design-master-metal-type'

type DesignSku = { sku: string; product_name?: string | null; metal_type?: string | null }
type DesignStyle = {
  style_code: string
  style_name?: string | null
  metal_type?: string | null
  skus: DesignSku[]
}

const RATE_KEYS = [
  'wastage_pct',
  'mc_rate',
  'mc_rate_slab_r',
  'mc_rate_slab_r1',
  'mc_rate_slab_w',
  'mc_rate_slab_f',
  'metal_slab_r_pct',
  'metal_slab_r1_pct',
  'metal_slab_w_pct',
  'metal_slab_f_pct',
] as const

function metalMatch(raw: string | null | undefined, want: string): boolean {
  const m = String(raw || '').toLowerCase()
  const w = String(want || '').toLowerCase()
  if (!m) return true
  if (w.startsWith('gold')) return m.includes('gold')
  if (w.startsWith('silver')) return m.includes('silver')
  return true
}

function emptyRates(): Record<(typeof RATE_KEYS)[number], string> {
  return {
    wastage_pct: '',
    mc_rate: '',
    mc_rate_slab_r: '',
    mc_rate_slab_r1: '',
    mc_rate_slab_w: '',
    mc_rate_slab_f: '',
    metal_slab_r_pct: '',
    metal_slab_r1_pct: '',
    metal_slab_w_pct: '',
    metal_slab_f_pct: '',
  }
}

function numOrUndef(v: string): number | undefined {
  const n = Number(String(v).replace(/[,₹\s]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

export function ErpSlabsWorkspace() {
  const { canDeleteRecords } = useErpOperator()
  const { settings, reload } = useErpSlabSettings()
  const [enabled, setEnabled] = useState<Record<ErpRateSlab, boolean>>({
    R: true,
    R1: true,
    W: true,
    F: true,
    Q: true,
  })
  const [labels, setLabels] = useState(DEFAULT_ERP_SLAB_LABELS)
  const [saveBusy, setSaveBusy] = useState(false)

  const [customers, setCustomers] = useState<ErpCustomer[]>([])
  const [customerQ, setCustomerQ] = useState('')
  const [customerPickIdx, setCustomerPickIdx] = useState(-1)
  const [selectedCustomer, setSelectedCustomer] = useState<ErpCustomer | null>(null)

  const [tree, setTree] = useState<DesignStyle[]>([])
  const [metalType, setMetalType] = useState('Silver')
  const [styleCode, setStyleCode] = useState('')
  const [selectedSkus, setSelectedSkus] = useState<string[]>([])
  const [rates, setRates] = useState(emptyRates)
  const [custBusy, setCustBusy] = useState(false)
  const [savedRows, setSavedRows] = useState<CustomerSlabRow[]>([])

  useEffect(() => {
    setEnabled(
      Object.fromEntries(ERP_SLAB_KEYS.map((k) => [k, settings.enabled_keys.includes(k)])) as Record<
        ErpRateSlab,
        boolean
      >,
    )
    setLabels({ ...DEFAULT_ERP_SLAB_LABELS, ...settings.labels })
  }, [settings])

  useEffect(() => {
    void axios
      .get<{ tree: DesignStyle[] }>('/api/reseller/erp/design-master/tree')
      .then((r) => setTree(r.data.tree || []))
      .catch(() => setTree([]))
  }, [])

  const loadCustomers = useCallback(async (q: string) => {
    try {
      const res = await axios.get<{ customers: ErpCustomer[] }>('/api/reseller/erp/customers', {
        params: q.trim() ? { q: q.trim() } : {},
      })
      setCustomers(res.data.customers || [])
    } catch {
      setCustomers([])
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void loadCustomers(customerQ), 200)
    return () => clearTimeout(t)
  }, [customerQ, loadCustomers])

  const loadCustomerSlabs = useCallback(async (customerId: number) => {
    try {
      const res = await axios.get<{ rows: CustomerSlabRow[] }>('/api/reseller/erp/customer-slabs', {
        params: { customer_id: customerId },
      })
      setSavedRows(res.data.rows || [])
    } catch {
      setSavedRows([])
    }
  }, [])

  const stylesForMetal = useMemo(
    () =>
      tree.filter(
        (s) => metalMatch(s.metal_type, metalType) || s.skus.some((sk) => metalMatch(sk.metal_type, metalType)),
      ),
    [tree, metalType],
  )
  const styleOptions = stylesForMetal.map((s) => s.style_code)
  const styleRow = stylesForMetal.find(
    (s) => s.style_code.trim().toUpperCase() === styleCode.trim().toUpperCase(),
  )
  const skuOptions = (styleRow?.skus || [])
    .filter((sk) => metalMatch(sk.metal_type, metalType))
    .map((sk) => sk.sku)

  useEffect(() => {
    if (!styleRow) {
      setSelectedSkus([])
      return
    }
    setSelectedSkus(skuOptions)
    // Selecting a style selects every SKU under it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleCode, metalType])

  const saveShopSlabs = async () => {
    const enabled_keys = ERP_SLAB_KEYS.filter((k) => enabled[k])
    if (!enabled_keys.length) {
      alert('Keep at least one slab on')
      return
    }
    setSaveBusy(true)
    try {
      const res = await axios.put('/api/reseller/erp/slab-settings', { enabled_keys, labels })
      const next = parseErpSlabSettings(res.data)
      setLabels({ ...DEFAULT_ERP_SLAB_LABELS, ...next.labels })
      await reload()
      appAlert('Slab names saved. They now apply across Scan & bill and Design master.', 'success')
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setSaveBusy(false)
    }
  }

  const pickCustomer = (c: ErpCustomer) => {
    setSelectedCustomer(c)
    setCustomerQ('')
    setCustomerPickIdx(-1)
    void loadCustomerSlabs(c.id)
  }

  const saveCustomerSlabs = async () => {
    if (!selectedCustomer) {
      alert('Select a customer')
      return
    }
    if (!styleCode.trim() || !selectedSkus.length) {
      alert('Choose a style and at least one SKU')
      return
    }
    setCustBusy(true)
    try {
      const payload = {
        customer_id: selectedCustomer.id,
        metal_type: metalType,
        style_code: styleCode.trim(),
        wastage_pct: numOrUndef(rates.wastage_pct),
        mc_rate: numOrUndef(rates.mc_rate),
        mc_rate_slab_r: numOrUndef(rates.mc_rate_slab_r),
        mc_rate_slab_r1: numOrUndef(rates.mc_rate_slab_r1),
        mc_rate_slab_w: numOrUndef(rates.mc_rate_slab_w),
        mc_rate_slab_f: numOrUndef(rates.mc_rate_slab_f),
        metal_slab_r_pct: numOrUndef(rates.metal_slab_r_pct),
        metal_slab_r1_pct: numOrUndef(rates.metal_slab_r1_pct),
        metal_slab_w_pct: numOrUndef(rates.metal_slab_w_pct),
        metal_slab_f_pct: numOrUndef(rates.metal_slab_f_pct),
      }
      for (const sku of selectedSkus) {
        await axios.put('/api/reseller/erp/customer-slabs', { ...payload, sku })
      }
      await loadCustomerSlabs(selectedCustomer.id)
      appAlert('Customer slab rates saved. They apply in Scan & bill when this customer is chosen.', 'success')
    } catch (e) {
      alert(erpErr(e))
    } finally {
      setCustBusy(false)
    }
  }

  const deleteRow = async (row: CustomerSlabRow) => {
    if (!canDeleteRecords || !row.id) return
    const ok = await appConfirm(`Delete customer slab for ${row.style_code} / ${row.sku}?`)
    if (!ok) return
    try {
      await axios.delete(`/api/reseller/erp/customer-slabs/${row.id}`)
      if (selectedCustomer) await loadCustomerSlabs(selectedCustomer.id)
    } catch (e) {
      alert(erpErr(e))
    }
  }

  const list = customers.slice(0, 8)

  return (
    <div className="space-y-4">
      <div className={`${erpCardCls} space-y-4`}>
        <div>
          <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Slabs in use</p>
          <p className="mt-0.5 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
            Turn on the slabs this shop uses, and rename them. Names appear in Scan &amp; bill, Design master, and metal %.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ERP_SLAB_KEYS.map((key) => (
            <div
              key={key}
              className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white px-3 py-3"
            >
              <label className="flex min-h-[44px] items-center gap-2 text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]">
                <input
                  type="checkbox"
                  className="size-4 rounded border-[var(--color-slate-700,#e8e4df)]"
                  checked={enabled[key]}
                  onChange={(e) => setEnabled((prev) => ({ ...prev, [key]: e.target.checked }))}
                />
                Slab {DEFAULT_ERP_SLAB_LABELS[key]}
              </label>
              <input
                className={`${erpInputCls} mt-1`}
                value={labels[key]}
                onChange={(e) => setLabels((prev) => ({ ...prev, [key]: e.target.value }))}
                placeholder={DEFAULT_ERP_SLAB_LABELS[key]}
                disabled={!enabled[key]}
              />
            </div>
          ))}
        </div>
        <button type="button" className={erpBtnPrimary} disabled={saveBusy} onClick={() => void saveShopSlabs()}>
          {saveBusy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Save slabs
        </button>
      </div>

      <div className={`${erpCardCls} space-y-4`}>
        <div>
          <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Customer slabs</p>
          <p className="mt-0.5 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
            Rates set here override Design master only when this customer is chosen on the bill. If not set, Design master is used.
          </p>
        </div>

        <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
          Customer
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-jewelry-black,#1a1814)]/40" />
            <input
              className={`${erpInputCls} pl-9`}
              placeholder="Search by name or mobile…"
              value={customerQ}
              onChange={(e) => {
                setCustomerQ(e.target.value)
                setCustomerPickIdx(-1)
              }}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                if (!list.length) return
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setCustomerPickIdx((i) => Math.min(i + 1, list.length - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setCustomerPickIdx((i) => Math.max(i - 1, 0))
                } else if (e.key === 'Enter' && customerPickIdx >= 0) {
                  e.preventDefault()
                  pickCustomer(list[customerPickIdx])
                }
              }}
            />
            {customerQ.trim() && list.length > 0 && !selectedCustomer ? (
              <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white shadow-lg">
                {list.map((c, i) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={`block w-full px-3 py-2.5 text-left text-sm ${
                        i === customerPickIdx
                          ? 'bg-[var(--kc-accent,#c41e3a)]/10'
                          : 'hover:bg-[var(--color-slate-900,#f7f4ef)]'
                      }`}
                      onClick={() => pickCustomer(c)}
                    >
                      <span className="font-medium text-[#1a1814]">{c.name}</span>
                      {c.mobile ? (
                        <span className="ml-2 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">{c.mobile}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {selectedCustomer ? (
            <p className="mt-1.5 rounded-lg border border-emerald-200 bg-emerald-50/60 px-2.5 py-2 text-[11px] text-[#1a1814]">
              {selectedCustomer.name}
              {selectedCustomer.mobile ? ` · ${selectedCustomer.mobile}` : ''}
              <button
                type="button"
                className="ml-2 font-semibold text-rose-600"
                onClick={() => {
                  setSelectedCustomer(null)
                  setSavedRows([])
                }}
              >
                Clear
              </button>
            </p>
          ) : null}
        </label>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
            Metal
            <select
              className={`${erpInputCls} mt-1`}
              value={metalType}
              onChange={(e) => {
                setMetalType(e.target.value)
                setStyleCode('')
              }}
            >
              {DESIGN_METAL_TYPE_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
            Style
            <div className="mt-1">
              <ErpBillingSuggestField
                value={styleCode}
                placeholder="Type or pick style…"
                options={styleOptions}
                emptyText="No styles in design master for this metal"
                inputClassName={erpInputCls}
                onChange={setStyleCode}
                onCommit={(v) => setStyleCode(v)}
              />
            </div>
          </label>
        </div>

        {skuOptions.length > 0 ? (
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/45">
                SKUs under {styleCode || 'style'}
              </p>
              <div className="flex gap-2">
                <button type="button" className={erpBtnGhost} onClick={() => setSelectedSkus(skuOptions)}>
                  Select all
                </button>
                <button type="button" className={erpBtnGhost} onClick={() => setSelectedSkus([])}>
                  Unselect all
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {skuOptions.map((sku) => {
                const on = selectedSkus.includes(sku)
                return (
                  <button
                    key={sku}
                    type="button"
                    className={`min-h-[44px] rounded-xl border px-3 text-sm font-medium ${
                      on
                        ? 'border-emerald-300 bg-emerald-50 text-[#1a1814]'
                        : 'border-[var(--color-slate-700,#e8e4df)] bg-white text-[var(--color-jewelry-black,#1a1814)]/70'
                    }`}
                    onClick={() =>
                      setSelectedSkus((prev) => (prev.includes(sku) ? prev.filter((s) => s !== sku) : [...prev, sku]))
                    }
                  >
                    {sku}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {RATE_KEYS.filter((key) => {
            if (key === 'mc_rate_slab_r' || key === 'metal_slab_r_pct') return enabled.R
            if (key === 'mc_rate_slab_r1' || key === 'metal_slab_r1_pct') return enabled.R1
            if (key === 'mc_rate_slab_w' || key === 'metal_slab_w_pct') return enabled.W
            if (key === 'mc_rate_slab_f' || key === 'metal_slab_f_pct') return enabled.F
            return true
          }).map((key) => (
            <label key={key} className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
              {slabRelatedFieldLabel(key, labels)}
              <input
                className={`${erpInputCls} mt-1 tabular-nums`}
                inputMode="decimal"
                value={rates[key]}
                onChange={(e) => setRates((prev) => ({ ...prev, [key]: e.target.value.replace(/[^\d.]/g, '') }))}
              />
            </label>
          ))}
        </div>

        <button type="button" className={erpBtnPrimary} disabled={custBusy} onClick={() => void saveCustomerSlabs()}>
          {custBusy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Save customer slab
        </button>

        {savedRows.length > 0 ? (
          <div className="-mx-1 overflow-x-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)]">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-[var(--color-slate-900,#f7f4ef)] text-[10px] font-bold uppercase text-[var(--color-jewelry-black,#1a1814)]/55">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2.5">Style</th>
                  <th className="whitespace-nowrap px-3 py-2.5">SKU</th>
                  <th className="whitespace-nowrap px-3 py-2.5">Metal</th>
                  {RATE_KEYS.filter((key) => {
                    if (key === 'mc_rate_slab_r' || key === 'metal_slab_r_pct') return enabled.R
                    if (key === 'mc_rate_slab_r1' || key === 'metal_slab_r1_pct') return enabled.R1
                    if (key === 'mc_rate_slab_w' || key === 'metal_slab_w_pct') return enabled.W
                    if (key === 'mc_rate_slab_f' || key === 'metal_slab_f_pct') return enabled.F
                    return true
                  }).map((key) => (
                    <th key={key} className="whitespace-nowrap px-3 py-2.5 text-right">
                      {slabRelatedFieldLabel(key, labels)}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 w-16" />
                </tr>
              </thead>
              <tbody>
                {savedRows.map((row) => (
                  <tr key={`${row.style_code}-${row.sku}-${row.id}`} className="border-t border-[var(--color-slate-700,#e8e4df)]/60">
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium text-[var(--color-jewelry-black,#1a1814)]">
                      {row.style_code}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">{row.sku}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{row.metal_type}</td>
                    {RATE_KEYS.filter((key) => {
                      if (key === 'mc_rate_slab_r' || key === 'metal_slab_r_pct') return enabled.R
                      if (key === 'mc_rate_slab_r1' || key === 'metal_slab_r1_pct') return enabled.R1
                      if (key === 'mc_rate_slab_w' || key === 'metal_slab_w_pct') return enabled.W
                      if (key === 'mc_rate_slab_f' || key === 'metal_slab_f_pct') return enabled.F
                      return true
                    }).map((key) => (
                      <td key={key} className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-[var(--color-jewelry-black,#1a1814)]">
                        {formatSlabRateValue(row[key])}
                      </td>
                    ))}
                    <td className="px-3 py-2.5">
                      {canDeleteRecords ? (
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-rose-600"
                          onClick={() => void deleteRow(row)}
                          aria-label="Delete"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  )
}
