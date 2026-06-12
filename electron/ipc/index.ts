import { registerAuthHandlers } from './auth'
import { registerBrandingHandlers } from './branding'

/** One register function per domain — new domains (items, sales, ...) plug in here. */
export function registerIpcHandlers(): void {
  registerAuthHandlers()
  registerBrandingHandlers()
}
