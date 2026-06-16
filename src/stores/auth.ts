import { defineStore } from 'pinia'
import type { MenuKey, PermKey, SessionUser } from '../../shared/types'
import { useCartStore } from './cart'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    session: null as SessionUser | null,
    /** Whether we've asked the main process for an existing session this launch. */
    restored: false
  }),

  getters: {
    isAuthenticated: (state) => state.session !== null,
    hasMenu: (state) => (key: MenuKey | string) => state.session?.menus.includes(key) ?? false,
    hasPermission: (state) => (key: PermKey | string) =>
      state.session?.permissions.includes(key) ?? false
  },

  actions: {
    /** Sync renderer state with the main-process session (e.g. after a reload in dev). */
    async restore(): Promise<void> {
      if (this.restored) return
      this.session = await window.api.auth.getSession()
      this.restored = true
    },

    async login(username: string, password: string): Promise<void> {
      this.session = await window.api.auth.login(username, password)
      // Belt-and-suspenders: the new account always starts on a clean POS,
      // even if the previous session ended without a logout.
      useCartStore().$reset()
    },

    async logout(): Promise<void> {
      await window.api.auth.logout()
      this.session = null
      // Session-scoped state must not leak to the next account: clear the cart,
      // vouchers, discounts and the cached last-sale receipt.
      useCartStore().$reset()
    }
  }
})
