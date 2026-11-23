/**
 * Admin access helpers — keep in sync with `services/authService.js` `SUPER_ADMIN_EMAILS`
 * and `middleware/auth.js` `isAdminStrict`.
 */
export const KC_SUPER_ADMIN_EMAIL = 'jaigaurav56789@gmail.com'

/** Whitelisted emails with full `/api/admin/*` access (matches server). */
export const KC_SUPER_ADMIN_EMAILS = [
  'jaigaurav56789@gmail.com',
  '22btrsn018@jainuniversity.ac.in',
] as const

export function isKcSuperAdminEmail(email: string | undefined | null): boolean {
  const normalized = String(email || '')
    .toLowerCase()
    .trim()
  return KC_SUPER_ADMIN_EMAILS.some((e) => e === normalized)
}

type UserLike = { email?: string; role?: string } | null | undefined

export function userHasAdminDashboardAccess(user: UserLike): boolean {
  if (!user) return false
  const email = String(user.email || '')
    .toLowerCase()
    .trim()
  const role = String(user.role || '')
  return (
    isKcSuperAdminEmail(email) || role === 'super_admin' || role === 'admin'
  )
}

/** Whitelisted identities may call `/api/admin/*` (matches server `isAdminStrict`). */
export function userCanCallStrictAdminApi(user: UserLike): boolean {
  if (!user) return false
  return isKcSuperAdminEmail(user.email)
}