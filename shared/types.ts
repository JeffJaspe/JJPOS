/**
 * Types shared between the Electron main process and the Vue renderer.
 * This file must stay dependency-free (no electron, no node imports).
 */

/** Envelope returned by every IPC handler so errors cross the bridge cleanly. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

/** The logged-in user as held in the main-process session and mirrored in the renderer. */
export interface SessionUser {
  id: number
  username: string
  fullName: string
  roleId: number
  roleName: string
  /** Sidebar menu keys visible to this role (from role_menus). */
  menus: string[]
  /** Granular action keys granted to this role (from role_permissions). */
  permissions: string[]
}

/** Sidebar menu keys. Must match the seeds in the migrations. */
export const MENU_KEYS = [
  'pos',
  'items',
  'customers',
  'inventory',
  'ledger',
  'reports',
  'settings'
] as const
export type MenuKey = (typeof MENU_KEYS)[number]

/** Permission keys checked by IPC handlers. Must match the seeds in the migrations. */
export const PERM_KEYS = [
  'sell',
  'void',
  'price_override',
  'edit_items',
  'edit_customers',
  'stock_adjust',
  'approve_voids',
  'export_reports',
  'manage_branding',
  'manage_users',
  'manage_settings'
] as const
export type PermKey = (typeof PERM_KEYS)[number]

// ---------------------------------------------------------------------------
// Masterfiles
// ---------------------------------------------------------------------------
// Note: SQLite has no booleans — `active` is 0/1. Money fields are centavos.

export interface Category {
  id: number
  name: string
}

export interface Supplier {
  id: number
  name: string
  contact: string
  active: number
}

export interface ItemListQuery {
  search?: string
  categoryId?: number | null
  includeInactive?: boolean
}

export interface ItemRow {
  id: number
  sku: string
  name: string
  description: string
  category_id: number | null
  category_name: string | null
  unit: string
  cost_price: number
  sell_price: number
  wholesale_price: number | null
  reorder_level: number
  tax_type: string
  qty_on_hand: number
  active: number
  barcode_count: number
}

export interface ItemDetail extends ItemRow {
  barcodes: string[]
}

export interface ItemInput {
  sku: string
  name: string
  description: string
  category_id: number | null
  unit: string
  cost_price: number
  sell_price: number
  wholesale_price: number | null
  reorder_level: number
  tax_type: 'vat' | 'non_vat'
  active: number
  barcodes: string[]
}

export interface CustomerListQuery {
  search?: string
  includeInactive?: boolean
}

export interface CustomerRow {
  id: number
  code: string
  name: string
  contact: string
  address: string
  tin: string
  credit_limit: number
  terms_days: number
  opening_balance: number
  active: number
}

export interface CustomerInput {
  code: string
  name: string
  contact: string
  address: string
  tin: string
  credit_limit: number
  terms_days: number
  /** Only honored on create — posts the starting ledger entry. Ignored on update. */
  opening_balance: number
  active: number
}

/** Key/value rows from the branding table. */
export interface Branding {
  app_name: string
  accent_color: string
  /** 'icon' (built-in icon name in logo_value) or 'image' (file path) — image support lands in Phase 6. */
  logo_type: string
  logo_value: string
}
