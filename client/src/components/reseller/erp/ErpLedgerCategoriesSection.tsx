'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import axios from '@/lib/axios'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { erpBtnGhost, erpBtnPrimary, erpCardCls, erpErr, erpInputCls } from '@/components/reseller/erp/erp-ui'
import { useErpOperator } from '@/context/ErpOperatorContext'
import { appConfirm } from '@/lib/app-notice'

export type LedgerCategoryRow = {
  id: number
  slug: string
  label: string
  sort_order: number
  is_system: boolean
}

export function ErpLedgerCategoriesSection({
  onChanged,
}: {
  onChanged?: (rows: LedgerCategoryRow[]) => void
} = {}) {
  const { operator, shadowUnlocked } = useErpOperator()
  const isAdmin = operator?.role === 'admin'
  const canEdit = !!operator
  const [busy, setBusy] = useState(true)
  const [rows, setRows] = useState<LedgerCategoryRow[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const res = await axios.get<{ categories: LedgerCategoryRow[] }>('/api/reseller/erp/ledger/categories')
      const list = res.data.categories || []
      setRows(list)
      onChangedRef.current?.(list)
    } catch (e) {
      console.error(e)
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const add = async () => {
    const label = newLabel.trim()
    if (!label || !canEdit) return
    try {
      await axios.post('/api/reseller/erp/ledger/categories', { label })
      setNewLabel('')
      await load()
    } catch (e) {
      alert(erpErr(e))
    }
  }

  const saveEdit = async () => {
    if (editId == null || !canEdit) return
    const label = editLabel.trim()
    if (!label) return
    try {
      await axios.put(`/api/reseller/erp/ledger/categories/${editId}`, { label })
      setEditId(null)
      setEditLabel('')
      await load()
    } catch (e) {
      alert(erpErr(e))
    }
  }

  const remove = async (row: LedgerCategoryRow) => {
    if (!shadowUnlocked || !isAdmin) return
    const ok = await appConfirm(`Delete category “${row.label}”?`)
    if (!ok) return
    try {
      await axios.delete(`/api/reseller/erp/ledger/categories/${row.id}`)
      await load()
    } catch (e) {
      alert(erpErr(e))
    }
  }

  if (!canEdit) return null

  return (
    <div className={`${erpCardCls} space-y-4`}>
      <div>
        <p className="text-sm font-semibold text-[var(--color-jewelry-black,#1a1814)]">Ledger categories</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 text-xs text-[var(--color-jewelry-black,#1a1814)]/55">
          New category
          <input
            className={`${erpInputCls} mt-1`}
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="e.g. Casting"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void add()
            }}
          />
        </label>
        <button type="button" className={erpBtnPrimary} onClick={() => void add()} disabled={!newLabel.trim()}>
          <Plus className="size-4" aria-hidden />
          Add
        </button>
      </div>
      {busy ? (
        <div className="flex justify-center py-6">
          <Loader2 className="size-6 animate-spin text-[var(--color-jewelry-black,#1a1814)]/35" />
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-slate-700,#e8e4df)] rounded-xl border border-[var(--color-slate-700,#e8e4df)]">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              {editId === row.id ? (
                <>
                  <input
                    className={`${erpInputCls} min-w-[12rem] flex-1`}
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    autoFocus
                  />
                  <button type="button" className={erpBtnPrimary} onClick={() => void saveEdit()}>
                    Save
                  </button>
                  <button
                    type="button"
                    className={erpBtnGhost}
                    onClick={() => {
                      setEditId(null)
                      setEditLabel('')
                    }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 text-sm font-medium text-[var(--color-jewelry-black,#1a1814)]">
                    {row.label}
                    {row.is_system ? (
                      <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-jewelry-black,#1a1814)]/40">
                        default
                      </span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    className={erpBtnGhost}
                    onClick={() => {
                      setEditId(row.id)
                      setEditLabel(row.label)
                    }}
                  >
                    Edit
                  </button>
                  {shadowUnlocked ? (
                    <button
                      type="button"
                      className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-800"
                      onClick={() => void remove(row)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                      Delete
                    </button>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
