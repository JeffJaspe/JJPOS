import { registerAuthHandlers } from './auth'
import { registerBrandingHandlers } from './branding'
import { registerItemHandlers } from './items'
import { registerCustomerHandlers } from './customers'
import { registerMasterfileHandlers } from './masterfiles'
import { registerPrintHandlers } from './print'
import { registerPromoHandlers } from './promos'
import { registerVoucherHandlers } from './vouchers'
import { registerSalesHandlers } from './sales'
import { registerSettingsHandlers } from './settings'

/** One register function per domain — new domains (sales, inventory, ...) plug in here. */
export function registerIpcHandlers(): void {
  registerAuthHandlers()
  registerBrandingHandlers()
  registerItemHandlers()
  registerCustomerHandlers()
  registerMasterfileHandlers()
  registerPrintHandlers()
  registerPromoHandlers()
  registerVoucherHandlers()
  registerSalesHandlers()
  registerSettingsHandlers()
}
