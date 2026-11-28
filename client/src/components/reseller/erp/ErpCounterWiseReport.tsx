'use client'

import { useCallback, useEffect, useState } from 'react'
import axios from '@/lib/axios'
import { ArrowLeft, Download, FileText, Loader2 } from 'lucide-react'
import { ErpDateInput } from '@/components/reseller/erp/ErpDateInput'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpErr, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { previewCounterWisePdf } from '@/lib/erp-counter-wise-pdf'
import { useAuth } from '@/hooks/useAuth'
import { useErpOperator } from '@/context/ErpOperatorContext'
import { formatErpDateDdMmYyyy } from '@/lib/erp-date-format'
import { appAlert } from '@/lib/app-notice'

type CounterKey = 'metal' | 'item' | 'approval' | 'stock'

type CounterRow = {
  counter: CounterKey
  opening: number
  receipt: number
  issue: number
  closing: number
  opening_date?: string | null
}

type Report = {
  from: string
  to: string
  rows: CounterRow[]
  total: { opening: number; receipt: number; issue: number; closing: number }
  openings?: Record<string, { opening_gm: number; opening_date: string }>
}

const COUNTERS: { key: CounterKey; label: string }[] = [
  { key: 'metal', label: 'metal' },
  { key: 'item', label: 'item' },
  { key: 'approval', label: 'approval' },
  { key: 'stock', label: 'stock' },
]

function exactGm(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return String(Math.round(n * 1e6) / 1e6)
}

export function ErpCounterWiseReport({
  defaultFrom,
  defaultTo,
  onBack,
}: {
  defaultFrom: string
  defaultTo: string
  onBack: () => void
}) {
  const auth = useAuth()
  const { operator, shadowUnlocked } = useErpOperator()
  const isAdmin = operator?.role === 'admin'
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [data, setData] = useState<Report | null>(null)
  const [openDraft, setOpenDraft] = useState<Record<CounterKey, { gm: string; date: string }>>({
    metal: { gm: '', date: defaultFrom },
    item: { gm: '', date: defaultFrom },
    approval: { gm: '', date: defaultFrom },
    stock: { gm: '', date: defaultFrom },
  })

  const load = useCallback(async () => {
    setBusy(true)
    setErr(null)
    try {
      const res = await axios.get<Report>('/api/reseller/erp/ledger/reports/counter-wise', {
        params: { from, to },
      })
      setData(res.data)
      const next = { ...openDraft }
      for (const c of COUNTERS) {
        const o = res.data.openings?.[c.key]
        next[c.key] = {
          gm: o ? exactGm(o.opening_gm) : next[c.key].gm,
          date: o?.opening_date || from,
        }
      }
      setOpenDraft(next)
    } catch (e) {
      setErr(erpErr(e))
      setData(null)
    } finally {
      setBusy(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to])

  useEffect(() => {
    void load()
  }, [load])

  const saveOpening = async (key: CounterKey) => {
    try {
      await axios.put('/api/reseller/erp/ledger/counter-openings', {
        counter_key: key,
        opening_gm: Number(openDraft[key].gm) || 0,
        opening_date: openDraft[key].date || from,
      })
      appAlert(`Opening saved for ${key}`, 'success')
      await load()
    } catch (e) {
      alert(erpErr(e))
    }
  }

  const exportCsv = () => {
    if (!data) return
    const lines = [
      'Counter,Opening,Receipt,issue,Closing',
      ...data.rows.map(
        (r) => `${r.counter},${exactGm(r.opening)},${exactGm(r.receipt)},${exactGm(r.issue)},${exactGm(r.closing)}`,
      ),
      `Total,${exactGm(data.total.opening)},${exactGm(data.total.receipt)},${exactGm(data.total.issue)},${exactGm(data.total.closing)}`,
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `counter-wise-${data.from}-${data.to}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const previewPdf = async () => {
    if (!data) return
    const u = auth.user as Record<string, unknown> | null | undefined
    await previewCounterWisePdf({
      from: data.from,
      to: data.to,
      shopName: String(u?.shop_name || u?.business_name || u?.name || '').trim() || undefined,
      rows: data.rows,
      total: data.total,
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={erpBtnGhost} onClick={onBack}>
          <ArrowLeft className="size-4" />
          All reports
        </button>
        <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Counter wise report</p>
      </div>

      <div className={`${erpCardCls} space-y-3`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
            From
            <ErpDateInput className={`${erpInputCls} mt-1`} value={from} onChange={setFrom} />
          </label>
          <label className="text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
            To
            <ErpDateInput className={`${erpInputCls} mt-1`} value={to} onChange={setTo} />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={erpBtnPrimary} disabled={busy} onClick={() => void load()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Run report
          </button>
          <button type="button" className={erpBtnGhost} disabled={!data?.rows?.length} onClick={exportCsv}>
            <Download className="size-4" />
            Excel (CSV)
          </button>
          <button type="button" className={erpBtnGhost} disabled={!data?.rows?.length} onClick={() => void previewPdf()}>
            <FileText className="size-4" />
            Preview PDF
          </button>
        </div>
        {err ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
            {err}
          </p>
        ) : null}
      </div>

      {isAdmin ? (
        <div className={`${erpCardCls} space-y-3`}>
          <p className="text-xs font-semibold text-[var(--color-jewelry-black,#1a1814)]">
            Counter openings {shadowUnlocked ? '(Jainav — can change anytime)' : ''}
          </p>
          <p className="text-[11px] text-[var(--color-jewelry-black,#1a1814)]/50">
            Same idea as daybook shop opening. Set grams on each counter; receipts and issues after that date are added.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {COUNTERS.map((c) => (
              <div key={c.key} className="rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white p-3">
                <p className="text-sm font-semibold capitalize text-[var(--color-jewelry-black,#1a1814)]">{c.label}</p>
                <label className="mt-2 block text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                  Opening (g)
                  <input
                    className={`${erpInputCls} mt-1 tabular-nums`}
                    inputMode="decimal"
                    value={openDraft[c.key].gm}
                    onChange={(e) =>
                      setOpenDraft((prev) => ({
                        ...prev,
                        [c.key]: { ...prev[c.key], gm: e.target.value.replace(/[^\d.-]/g, '') },
                      }))
                    }
                  />
                </label>
                <label className="mt-2 block text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
                  From date
                  <ErpDateInput
                    className={`${erpInputCls} mt-1`}
                    value={openDraft[c.key].date}
                    onChange={(v) =>
                      setOpenDraft((prev) => ({ ...prev, [c.key]: { ...prev[c.key], date: v } }))
                    }
                  />
                </label>
                <button
                  type="button"
                  className={`${erpBtnPrimary} mt-3`}
                  onClick={() => void saveOpening(c.key)}
                >
                  Save {c.label} opening
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-[var(--color-slate-700,#e8e4df)] bg-white">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-[var(--color-slate-900,#f7f4ef)] text-[10px] font-bold uppercase text-[var(--color-jewelry-black,#1a1814)]/55">
            <tr>
              <th className="px-3 py-2.5">Counter</th>
              <th className="px-3 py-2.5 text-right">Opening</th>
              <th className="px-3 py-2.5 text-right">Receipt</th>
              <th className="px-3 py-2.5 text-right">issue</th>
              <th className="px-3 py-2.5 text-right">Closing</th>
            </tr>
          </thead>
          <tbody>
            {!data?.rows?.length && !busy ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-[var(--color-jewelry-black,#1a1814)]/45">
                  Run the report to see counter weights (grams).
                </td>
              </tr>
            ) : (
              <>
                {data?.rows.map((r) => (
                  <tr key={r.counter} className="border-t border-[var(--color-slate-700,#e8e4df)]/60">
                    <td className="px-3 py-2.5 font-medium capitalize text-[var(--color-jewelry-black,#1a1814)]">
                      {r.counter}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{exactGm(r.opening)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{exactGm(r.receipt)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{exactGm(r.issue)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{exactGm(r.closing)}</td>
                  </tr>
                ))}
                {data ? (
                  <tr className="border-t-2 border-[var(--color-slate-700,#e8e4df)] bg-[var(--color-slate-900,#f7f4ef)]/50 font-semibold">
                    <td className="px-3 py-2.5 text-[var(--color-jewelry-black,#1a1814)]">Total</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{exactGm(data.total.opening)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{exactGm(data.total.receipt)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{exactGm(data.total.issue)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{exactGm(data.total.closing)}</td>
                  </tr>
                ) : null}
              </>
            )}
          </tbody>
        </table>
        {data ? (
          <p className="px-3 py-2 text-[10px] text-[var(--color-jewelry-black,#1a1814)]/45">
            Grams · {formatErpDateDdMmYyyy(data.from)} – {formatErpDateDdMmYyyy(data.to)}
          </p>
        ) : null}
      </div>
    </div>
  )
}
