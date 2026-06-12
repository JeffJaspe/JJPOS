import { useAuthStore } from '@/stores/auth'
import type { MenuKey, PermKey } from '../../shared/types'

/**
 * Convenience wrapper for permission checks in components.
 * UI-only — the main process re-checks every permission on each IPC call.
 */
export function usePermissions() {
  const auth = useAuthStore()
  return {
    can: (perm: PermKey) => auth.hasPermission(perm),
    hasMenu: (menu: MenuKey) => auth.hasMenu(menu)
  }
}
