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
  /** True when the role is the locked, built-in Super admin (full access, role builder). */
  isSuperAdmin: boolean
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
  'discount',
  'require_customer',
  'edit_items',
  'edit_customers',
  'manage_ledger',
  'manage_vouchers',
  'stock_adjust',
  'approve_voids',
  'export_reports',
  'view_audit',
  'view_price_log',
  'manage_branding',
  'manage_users',
  'manage_settings',
  'manage_backup'
] as const
export type PermKey = (typeof PERM_KEYS)[number]

/** Human labels for the role builder — keep in sync with MENU_KEYS / PERM_KEYS. */
export const MENU_LABELS: Record<MenuKey, string> = {
  pos: 'Point of Sale',
  items: 'Items',
  customers: 'Customers',
  inventory: 'Inventory',
  ledger: 'Customer Ledger',
  reports: 'Reports',
  settings: 'Settings'
}

export const PERM_LABELS: Record<PermKey, string> = {
  sell: 'Complete sales',
  void: 'Void sales',
  price_override: 'Override prices at POS',
  discount: 'Apply discounts (line & transaction)',
  require_customer: 'Require a customer on every sale',
  edit_items: 'Edit items, categories, promos',
  edit_customers: 'Edit customers',
  manage_ledger: 'Record AR payments & adjustments',
  manage_vouchers: 'Issue / cancel vouchers',
  stock_adjust: 'Receive & adjust stock',
  approve_voids: 'Approve voids (supervisor)',
  export_reports: 'View & export reports',
  view_audit: 'View audit & security logs',
  view_price_log: 'View item price-change log',
  manage_branding: 'Manage branding',
  manage_users: 'Manage user accounts',
  manage_settings: 'Manage store settings',
  manage_backup: 'Back up & restore the database'
}

/** A backup file on disk, surfaced in Settings → Backup. */
export interface BackupFile {
  name: string
  path: string
  /** Size in bytes. */
  size: number
  /** ISO 8601 UTC of the file's modified time. */
  createdAt: string
}

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

export type PaymentMethod = 'cash' | 'card' | 'ewallet' | 'gcash' | 'paymaya' | 'charge'

export interface PaymentInput {
  method: PaymentMethod
  amount: number
}

export type SpecialDiscountType = 'senior' | 'pwd'

/** Senior-citizen / PWD discount: applied per transaction, captures the ID. */
export interface SpecialDiscount {
  type: SpecialDiscountType
  /** ID holder's name. */
  name: string
  /** OSCA / PWD ID number presented. */
  id: string
}

export interface SaleInput {
  lines: CartLineInput[]
  discount_type: 'none' | 'percent' | 'amount'
  discount_value: number
  /** Senior/PWD discount (flat 20%). When set, it replaces the manual discount. */
  special_discount: SpecialDiscount | null
  /** Supervisor credentials approving a manual discount when the cashier lacks `discount`. */
  discount_approver: { username: string; password: string } | null
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
  /** '' for a normal sale, else 'senior' / 'pwd'. */
  sd_type: string
  sd_name: string
  sd_id: string
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

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export interface StockInLine {
  item_id: number
  qty: number
  /** New cost price (centavos) to record on the item, or null to keep current. */
  new_cost: number | null
}

export interface StockInInput {
  supplier_id: number | null
  ref_no: string
  note: string
  lines: StockInLine[]
}

export type AdjustReason = 'damage' | 'loss' | 'expired' | 'count_correction' | 'other'

export interface AdjustInput {
  item_id: number
  /** Signed quantity change: negative removes stock. */
  qty_change: number
  reason: AdjustReason
  note: string
}

export interface MovementQuery {
  itemId?: number | null
  type?: string
  limit?: number
}

export interface MovementRow {
  id: number
  datetime: string
  item_name: string
  sku: string
  type: string
  qty_change: number
  note: string
  user: string
}

export interface StocktakeLine {
  item_id: number
  counted_qty: number
}

export interface StocktakeInput {
  note: string
  lines: StocktakeLine[]
}

export interface StocktakeResult {
  adjusted: number
  unchanged: number
}

export interface LowStockRow {
  id: number
  sku: string
  name: string
  unit: string
  qty_on_hand: number
  reorder_level: number
}

// ---------------------------------------------------------------------------
// Receipt template (configurable layout)
// ---------------------------------------------------------------------------

/** Element kinds a receipt can contain. Data elements pull from the sale; the rest are static. */
export type ReceiptElementType =
  | 'logo'
  | 'store_name'
  | 'store_address'
  | 'header'
  | 'sale_info'
  | 'cashier'
  | 'customer'
  | 'sd_info'
  | 'items'
  | 'totals'
  | 'payments'
  | 'change'
  | 'footer'
  | 'custom'
  | 'divider'
  | 'spacer'

export interface ReceiptElement {
  id: string
  type: ReceiptElementType
  enabled: boolean
  align?: 'left' | 'center' | 'right'
  bold?: boolean
  /** Text for 'custom'; ignored otherwise. */
  text?: string
}

export interface ReceiptTemplate {
  /** Printable width in millimetres (e.g. 58 or 80). */
  width_mm: number
  elements: ReceiptElement[]
}

/** Key/value rows from the branding table. */
export interface Branding {
  app_name: string
  /** Primary brand color — buttons, links, active nav, focus rings (CSS --accent). */
  accent_color: string
  /** Secondary color — the logo mark (CSS --accent-2). Empty falls back to accent_color. */
  accent_color_2: string
  /** Sidebar background color (CSS --sidebar). */
  sidebar_color: string
  /** 'icon' (built-in icon name in logo_value) or 'image' (data URL in logo_value). */
  logo_type: string
  logo_value: string
  /** App/window favicon as a data URL (PNG or SVG). Empty = use the bundled default. */
  favicon: string
}

// ---------------------------------------------------------------------------
// Users & roles (admin)
// ---------------------------------------------------------------------------

/** A user account as listed in Settings → Users (never includes the password hash). */
export interface UserRow {
  id: number
  username: string
  full_name: string
  role_id: number
  role_name: string
  active: number
  created_at: string
}

export interface UserCreateInput {
  username: string
  full_name: string
  password: string
  role_id: number
  active: boolean
}

/** Edit a user's profile/role/active flag — password is changed separately. */
export interface UserUpdateInput {
  full_name: string
  role_id: number
  active: boolean
}

/** A role with its assigned menus, permissions, and how many users hold it. */
export interface RoleRow {
  id: number
  name: string
  is_system: number
  locked: number
  user_count: number
  menus: string[]
  permissions: string[]
}

export interface RoleInput {
  name: string
  menus: string[]
  permissions: string[]
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
// All money values are centavos. Date bounds are UTC; `toUtc` is exclusive.

export interface ReportRange {
  fromUtc: string
  toUtc: string
}

export interface PaymentBreakdown {
  method: string
  amount: number
  count: number
}

export interface CashierBreakdown {
  user: string
  net: number
  count: number
}

/** Z-reading style daily/period summary. */
export interface DailySalesReport {
  count: number
  gross: number
  discount: number
  voucherDiscount: number
  tax: number
  net: number
  voidedCount: number
  voidedAmount: number
  byPayment: PaymentBreakdown[]
  byCashier: CashierBreakdown[]
}

export interface SalesByItemRow {
  item_id: number
  sku: string
  name: string
  qty: number
  sales: number
  cost: number
  profit: number
}

export interface SalesByCategoryRow {
  category: string
  qty: number
  sales: number
  cost: number
  profit: number
}

export interface InventoryValuationRow {
  id: number
  sku: string
  name: string
  unit: string
  qty_on_hand: number
  cost_price: number
  sell_price: number
  cost_value: number
  retail_value: number
}

export interface InventoryValuationReport {
  rows: InventoryValuationRow[]
  totalCostValue: number
  totalRetailValue: number
}

/** One row per sale — who rang it up and when (transaction listing report). */
export interface TransactionRow {
  sale_no: string
  datetime: string
  cashier: string
  customer: string | null
  payment_type: string
  total: number
  status: string
}

/** Audit-log categories surfaced as security reports. */
export type AuditCategory = 'all' | 'logins' | 'overrides' | 'voids' | 'discounts' | 'price_changes'

export interface AuditLogQuery {
  fromUtc: string
  toUtc: string
  category: AuditCategory
}

export interface AuditRow {
  datetime: string
  user: string | null
  action: string
  detail: string
}

// ---------------------------------------------------------------------------
// Customer ledger (AR)
// ---------------------------------------------------------------------------

export type LedgerMethod = 'cash' | 'check' | 'pdc' | 'card' | 'gcash' | 'paymaya'

/** A customer with their current AR balance and aging buckets (all centavos). */
export interface LedgerCustomer {
  id: number
  code: string
  name: string
  credit_limit: number
  balance: number
  current: number
  d30: number
  d60: number
  d90: number
}

export interface LedgerEntryQuery {
  customerId: number
  fromUtc?: string | null
  toUtc?: string | null
  /** '' | 'charge' | 'payment' | 'adj' */
  type?: string
}

export interface LedgerEntryRow {
  id: number
  datetime: string
  type: string
  ref_no: string
  method: string
  bank: string
  check_no: string
  check_date: string
  check_due_date: string
  debit: number
  credit: number
  note: string
  user: string
  /** Running balance up to and including this entry (centavos). */
  balance: number
}

export interface LedgerPaymentInput {
  customer_id: number
  amount: number
  method: LedgerMethod
  /** Official receipt number → stored as ref_no. */
  or_no: string
  /** Drawee bank (check / PDC). */
  bank: string
  check_no: string
  /** Date the check was issued (local 'YYYY-MM-DD'). */
  check_date: string
  /** PDC maturity / due date (local 'YYYY-MM-DD'). */
  due_date: string
  note: string
}

/** Generic Excel export payload — reused by every report. */
export interface ExcelColumn {
  header: string
  key: string
  width?: number
  /** money → #,##0.00; int → #,##0; percent → 0.0%. Default: plain. */
  format?: 'money' | 'int' | 'percent'
}

export interface ExcelExport {
  fileName: string
  sheetName: string
  title?: string
  columns: ExcelColumn[]
  rows: Record<string, string | number>[]
}
