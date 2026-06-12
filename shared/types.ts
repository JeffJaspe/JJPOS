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
  'stock_adjust',
  'approve_voids',
  'export_reports',
  'manage_branding',
  'manage_users',
  'manage_settings'
] as const
export type PermKey = (typeof PERM_KEYS)[number]

/** Key/value rows from the branding table. */
export interface Branding {
  app_name: string
  accent_color: string
  /** 'icon' (built-in icon name in logo_value) or 'image' (file path) — image support lands in Phase 6. */
  logo_type: string
  logo_value: string
}
