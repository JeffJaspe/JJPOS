import type { PermKey, SessionUser } from '../../shared/types'

/**
 * The single logged-in user for this terminal, held in the main process.
 * Every privileged IPC handler must go through requireAuth/requirePermission —
 * hiding a menu in the UI is not security.
 */
let current: SessionUser | null = null

export function setSession(user: SessionUser | null): void {
  current = user
}

export function getSession(): SessionUser | null {
  return current
}

export function requireAuth(): SessionUser {
  if (!current) throw new Error('Not signed in')
  return current
}

export function requirePermission(perm: PermKey): SessionUser {
  const user = requireAuth()
  if (!user.permissions.includes(perm)) {
    throw new Error(`You do not have permission to do this (${perm})`)
  }
  return user
}

/** The role builder is Super-admin-only (the locked, built-in role). */
export function requireSuperAdmin(): SessionUser {
  const user = requireAuth()
  if (!user.isSuperAdmin) throw new Error('Only the Superadmin can manage roles')
  return user
}
