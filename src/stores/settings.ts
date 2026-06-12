import { defineStore } from 'pinia'
import type { Branding } from '../../shared/types'

const DEFAULT_BRANDING: Branding = {
  app_name: 'JJ POS',
  accent_color: '#4f46e5',
  logo_type: 'icon',
  logo_value: 'storefront'
}

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    branding: { ...DEFAULT_BRANDING },
    brandingLoaded: false,
    /** settings table key/values (store name, VAT rate, receipt config, ...). */
    app: {} as Record<string, string>,
    appLoaded: false
  }),

  actions: {
    async loadBranding(): Promise<void> {
      if (this.brandingLoaded) return
      this.branding = { ...DEFAULT_BRANDING, ...(await window.api.branding.get()) }
      this.brandingLoaded = true
      this.applyBranding()
    },

    async loadAppSettings(): Promise<void> {
      if (this.appLoaded) return
      this.app = await window.api.settings.get()
      this.appLoaded = true
    },

    applyBranding(): void {
      document.documentElement.style.setProperty('--accent', this.branding.accent_color)
      document.title = this.branding.app_name
    }
  }
})
