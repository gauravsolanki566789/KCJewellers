/**
 * Admin users who may use Catalogue Builder / shared-catalog APIs.
 * Aligns with `AdminGuard` and `services/authService.resolveUserRole` (super_admin emails + roles).
 */
import { isKcSuperAdminEmail } from '@/lib/admin-access'

export function isCatalogAdminUser(user: unknown): boolean {
  if (!user || typeof user !== 'object') return false
  const u = user as { email?: string; role?: string }
  const email = (u.email || '').toLowerCase().trim()
  if (isKcSuperAdminEmail(email)) return true
  const role = String(u.role || '').toLowerCase()
  return role === 'super_admin' || role === 'admin'
}