import { defineStore } from 'pinia'
import type { Branding } from '../../shared/types'

const DEFAULT_BRANDING: Branding = {
  app_name: 'JJ POS',
  accent_color: '#4f46e5',
  accent_color_2: '', // empty → falls back to accent_color so existing logos don't shift
  sidebar_color: '#111827',
  logo_type: 'icon',
  logo_value: 'storefront',
  favicon: ''
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

    /** Merge freshly-saved settings into the in-memory copy so the app reflects them live. */
    setAppSettings(updates: Record<string, string>): void {
      this.app = { ...this.app, ...updates }
    },

    applyBranding(): void {
      const root = document.documentElement.style
      root.setProperty('--accent', this.branding.accent_color)
      // Secondary defaults to the primary accent when unset, so a single-color
      // setup still looks coherent.
      root.setProperty('--accent-2', this.branding.accent_color_2 || this.branding.accent_color)
      root.setProperty('--sidebar', this.branding.sidebar_color || '#111827')
      document.title = this.branding.app_name

      // Document favicon (works for PNG and SVG data URLs).
      if (this.branding.favicon) {
        let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
        if (!link) {
          link = document.createElement('link')
          link.rel = 'icon'
          document.head.appendChild(link)
        }
        link.href = this.branding.favicon
      }
    },

    /** Adopt freshly-saved branding and apply it live (sidebar, login, accent). */
    setBranding(branding: Branding): void {
      this.branding = { ...branding }
      this.brandingLoaded = true
      this.applyBranding()
    }
  }
})
