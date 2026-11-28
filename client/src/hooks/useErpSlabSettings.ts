'use client'

import { useCallback, useEffect, useState } from 'react'
import axios from '@/lib/axios'
import {
  parseErpSlabSettings,
  type ErpSlabSettings,
} from '@/lib/erp-slab-settings'

export function useErpSlabSettings() {
  const [settings, setSettings] = useState<ErpSlabSettings>(() => parseErpSlabSettings(null))
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    try {
      const res = await axios.get('/api/reseller/erp/slab-settings')
      setSettings(parseErpSlabSettings(res.data))
    } catch {
      setSettings(parseErpSlabSettings(null))
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { settings, loaded, reload, setSettings }
}
