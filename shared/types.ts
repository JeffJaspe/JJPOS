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
  'manage_vouchers',
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

// ---------------------------------------------------------------------------
// Promos & vouchers
// ---------------------------------------------------------------------------

export type PromoType = 'percent' | 'amount' | 'fixed_price'

export interface Promo {
  id: number
  name: string
  type: PromoType
  value: number
  starts_at: string | null
  ends_at: string | null
  active: number
  created_at: string
  item_count: number
}

export interface PromoDetail extends Promo {
  itemIds: number[]
}

export interface PromoInput {
  name: string
  type: PromoType
  value: number
  starts_at: string | null
  ends_at: string | null
  active: number
  itemIds: number[]
}

export type VoucherType = 'fixed' | 'percent'
export type VoucherStatus = 'active' | 'redeemed' | 'cancelled'

export interface Voucher {
  id: number
  code: string
  type: VoucherType
  value: number
  expires_at: string | null
  status: VoucherStatus
  redeemed_sale_id: number | null
  redeemed_at: string | null
  note: string
  created_at: string
}

export interface VoucherCreateInput {
  count: number
  type: VoucherType
  value: number
  expires_at: string | null
  note: string
}

// ---------------------------------------------------------------------------
// POS & sales
// ---------------------------------------------------------------------------

/** Item as the POS sees it: promo already resolved into an effective price. */
export interface PosItem {
  itemId: number
  sku: string
  name: string
  unit: string
  sellPrice: number
  effectivePrice: number
  promoId: number | null
  promoName: string | null
  qtyOnHand: number
  taxType: string
}

export type PosScanResult =
  | { kind: 'item'; item: PosItem }
  | { kind: 'voucher'; voucher: Voucher }
  | { kind: 'none' }

export interface CartLineInput {
  item_id: number
  qty: number
  /** Unit price actually charged (centavos). Server re-validates against promo/override rules. */
  price: number
  line_discount: number
}

export type PaymentMethod = 'cash' | 'card' | 'ewallet' | 'charge'

export interface PaymentInput {
  method: PaymentMethod
  amount: number
}

export interface SaleInput {
  lines: CartLineInput[]
  discount_type: 'none' | 'percent' | 'amount'
  discount_value: number
  voucher_codes: string[]
  customer_id: number | null
  payments: PaymentInput[]
}

export interface SaleReceiptLine {
  name: string
  qty: number
  unit: string
  price: number
  line_discount: number
  line_total: number
  promo_name: string | null
}

export interface SaleReceipt {
  id: number
  sale_no: string
  datetime: string
  subtotal: number
  discount: number
  voucher_discount: number
  tax: number
  total: number
  amount_paid: number
  change: number
  payment_type: string
  status: string
  customer_name: string | null
  cashier: string
  lines: SaleReceiptLine[]
  payments: PaymentInput[]
}

export interface RecentSale {
  id: number
  sale_no: string
  datetime: string
  total: number
  status: string
  cashier: string
  customer_name: string | null
}

export interface VoidSaleInput {
  sale_id: number
  reason: string
  /** Supervisor credentials when the logged-in user lacks the void permission. */
  supervisor: { username: string; password: string } | null
}

export interface HeldSale {
  id: number
  label: string
  created_at: string
  cashier: string
}

/** Key/value rows from the branding table. */
export interface Branding {
  app_name: string
  accent_color: string
  /** 'icon' (built-in icon name in logo_value) or 'image' (file path) — image support lands in Phase 6. */
  logo_type: string
  logo_value: string
}
