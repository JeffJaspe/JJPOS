import { defineStore } from 'pinia'

/**
 * Cross-cutting UI state. `kiosk` = POS fullscreen mode: the whole document is
 * fullscreen and the shell hides its chrome. We never fullscreen the POS
 * element itself — anything teleported to <body> (modals, toasts) would not
 * render inside a fullscreened sub-element.
 */
export const useUiStore = defineStore('ui', {
  state: () => ({
    kiosk: false
  })
})
