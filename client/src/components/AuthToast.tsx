'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, XCircle, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

function loginSuccessLabel(
  user: unknown,
  emailFromUrl: string | null,
  nameFromUrl: string | null,
) {
  const u = user as { name?: string; email?: string } | undefined
  return (u?.name || nameFromUrl || u?.email || emailFromUrl || 'User').trim()
}

function clearAuthQueryParams(extra?: string[]) {
  if (typeof window === 'undefined') return
  const newUrl = new URL(window.location.href)
  ;['auth', 'email', 'role', 'name', 'reason', ...(extra || [])].forEach((k) =>
    newUrl.searchParams.delete(k),
  )
  window.history.replaceState({}, '', newUrl.toString())
}

function AuthToastContent() {
  const searchParams = useSearchParams()
  const auth = useAuth()
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const successDismissScheduledRef = useRef(false)

  useEffect(() => {
    const authStatus = searchParams?.get('auth')
    if (authStatus === 'success') {
      const email = searchParams?.get('email')
      const name = searchParams?.get('name')
      const role = searchParams?.get('role')
      const isAdmin = role === 'super_admin' || role === 'admin'
      const preferSession = auth.hasChecked && auth.isAuthenticated
      const label = loginSuccessLabel(preferSession ? auth.user : undefined, email, name)
      setToast({
        type: 'success',
        message: `Successfully logged in as ${label}${isAdmin ? ' (Admin)' : ''}`,
      })
      if (!successDismissScheduledRef.current) {
        successDismissScheduledRef.current = true
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
          setToast(null)
          clearAuthQueryParams()
          timerRef.current = null
          successDismissScheduledRef.current = false
        }, 3500)
      }
    } else if (authStatus === 'failed') {
      successDismissScheduledRef.current = false
      const reason = searchParams?.get('reason')
      setToast({
        type: 'error',
        message: `Login failed: ${reason || 'Unknown error'}`,
      })
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        setToast(null)
        clearAuthQueryParams()
        timerRef.current = null
      }, 5000)
    }
  }, [searchParams, auth.hasChecked, auth.isAuthenticated, auth.user])

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  if (!toast) return null

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[9999] transition-all duration-300 ease-out">
      <div
        className={`px-6 py-4 rounded-lg shadow-xl font-medium text-sm flex items-center gap-3 border-2 min-w-[300px] max-w-[90vw] ${
          toast.type === 'success'
            ? 'bg-green-500/90 text-white border-green-400'
            : 'bg-red-500/90 text-white border-red-400'
        }`}
      >
        {toast.type === 'success' ? (
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
        ) : (
          <XCircle className="w-5 h-5 flex-shrink-0" />
        )}
        <span className="flex-1">{toast.message}</span>
        <button
          onClick={() => {
            setToast(null)
            clearAuthQueryParams()
          }}
          className="p-1 hover:bg-white/20 rounded transition-colors"
          type="button"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export default function AuthToast() {
  return (
    <Suspense fallback={null}>
      <AuthToastContent />
    </Suspense>
  )
}