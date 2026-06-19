import { contextBridge, ipcRenderer } from 'electron'
import type {
  AdjustInput,
  AuditLogQuery,
  AuditRow,
  BackupFile,
  Branding,
  Category,
  DailySalesReport,
  ExcelExport,
  InventoryValuationReport,
  CustomerInput,
  CustomerListQuery,
  CustomerRow,
  HeldSale,
  IpcResult,
  ItemDetail,
  ItemInput,
  ItemListQuery,
  ItemRow,
  LedgerCustomer,
  LedgerEntryQuery,
  LedgerEntryRow,
  LedgerPaymentInput,
  LowStockRow,
  MovementQuery,
  MovementRow,
  PosItem,
  PosScanResult,
  Promo,
  PromoDetail,
  PromoInput,
  RecentSale,
  ReportRange,
  RoleInput,
  RoleRow,
  SaleInput,
  SalesByCategoryRow,
  SalesByItemRow,
  SaleReceipt,
  SessionUser,
  StockInInput,
  StocktakeInput,
  StocktakeResult,
  Supplier,
  TransactionRow,
  UserCreateInput,
  UserRow,
  UserUpdateInput,
  VoidSaleInput,
  Voucher,
  VoucherCreateInput,
  VoucherStatus
} from '../shared/types'

/** Unwrap the IpcResult envelope so renderer callers get plain data or a thrown Error. */
async function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, payload)) as IpcResult<T>
  if (!result.ok) throw new Error(result.error)
  return result.data
}

const api = {
  auth: {
    login: (username: string, password: string) =>
      invoke<SessionUser>('auth:login', { username, password }),
    logout: () => invoke<true>('auth:logout'),
    getSession: () => invoke<SessionUser | null>('auth:getSession'),
    /** Inline supervisor override: verify creds + a permission for an action (e.g. void a line). */
    verifySupervisor: (username: string, password: string, permission: string, action: string) =>
      invoke<{ username: string }>('auth:verifySupervisor', {
        username,
        password,
        permission,
        action
      })
  },
  branding: {
    get: () => invoke<Branding>('branding:get'),
    set: (input: Branding) => invoke<true>('branding:set', input)
  },
  items: {
    list: (query: ItemListQuery = {}) => invoke<ItemRow[]>('items:list', query),
    get: (id: number) => invoke<ItemDetail>('items:get', id),
    create: (input: ItemInput) => invoke<number>('items:create', input),
    update: (id: number, input: ItemInput) => invoke<true>('items:update', { id, input }),
    nextBarcode: () => invoke<string>('items:nextBarcode')
  },
  customers: {
    list: (query: CustomerListQuery = {}) => invoke<CustomerRow[]>('customers:list', query),
    create: (input: CustomerInput) => invoke<number>('customers:create', input),
    update: (id: number, input: CustomerInput) => invoke<true>('customers:update', { id, input })
  },
  categories: {
    list: () => invoke<Category[]>('categories:list'),
    create: (name: string) => invoke<number>('categories:create', name),
    update: (id: number, name: string) => invoke<true>('categories:update', { id, name }),
    remove: (id: number) => invoke<true>('categories:remove', id)
  },
  suppliers: {
    list: (includeInactive = false) => invoke<Supplier[]>('suppliers:list', { includeInactive }),
    create: (name: string, contact: string) => invoke<number>('suppliers:create', { name, contact }),
    update: (id: number, name: string, contact: string, active: number) =>
      invoke<true>('suppliers:update', { id, name, contact, active })
  },
  print: {
    listPrinters: () =>
      invoke<{ name: string; displayName: string }[]>('print:listPrinters'),
    /** Base64 PDF of the document, paginated exactly as it will print. */
    previewPdf: (html: string) => invoke<string>('print:previewPdf', { html }),
    /** Returns false if the user cancelled the print dialog. */
    html: (html: string) => invoke<boolean>('print:html', { html }),
    /** Silent receipt print to the configured/default printer. */
    receipt: (html: string) => invoke<boolean>('print:receipt', { html })
  },
  pos: {
    scan: (code: string) => invoke<PosScanResult>('pos:scan', code),
    search: (term: string) => invoke<PosItem[]>('pos:search', term)
  },
  sales: {
    complete: (input: SaleInput) => invoke<SaleReceipt>('sales:complete', input),
    void: (input: VoidSaleInput) => invoke<SaleReceipt>('sales:void', input),
    recent: (limit = 30) => invoke<RecentSale[]>('sales:recent', { limit }),
    get: (id: number) => invoke<SaleReceipt>('sales:get', id),
    hold: (label: string, payload: string) => invoke<number>('sales:hold', { label, payload }),
    held: () => invoke<HeldSale[]>('sales:held'),
    recall: (id: number) => invoke<string>('sales:recall', id),
    deleteHeld: (id: number) => invoke<true>('sales:deleteHeld', id)
  },
  promos: {
    list: () => invoke<Promo[]>('promos:list'),
    get: (id: number) => invoke<PromoDetail>('promos:get', id),
    create: (input: PromoInput) => invoke<number>('promos:create', input),
    update: (id: number, input: PromoInput) => invoke<true>('promos:update', { id, input }),
    setActive: (id: number, active: number) => invoke<true>('promos:setActive', { id, active })
  },
  vouchers: {
    list: (status: VoucherStatus | 'all' = 'all') => invoke<Voucher[]>('vouchers:list', { status }),
    create: (input: VoucherCreateInput) => invoke<Voucher[]>('vouchers:create', input),
    cancel: (id: number) => invoke<true>('vouchers:cancel', id)
  },
  settings: {
    get: () => invoke<Record<string, string>>('settings:get'),
    set: (key: string, value: string) => invoke<true>('settings:set', { key, value }),
    setInvoiceNumber: (next: number) => invoke<true>('settings:setInvoiceNumber', { next })
  },
  inventory: {
    stockIn: (input: StockInInput) => invoke<true>('inventory:stockIn', input),
    adjust: (input: AdjustInput) => invoke<true>('inventory:adjust', input),
    stocktake: (input: StocktakeInput) => invoke<StocktakeResult>('inventory:stocktake', input),
    movements: (query: MovementQuery = {}) => invoke<MovementRow[]>('inventory:movements', query),
    lowStock: () => invoke<LowStockRow[]>('inventory:lowStock')
  },
  reports: {
    dailySales: (range: ReportRange) => invoke<DailySalesReport>('reports:dailySales', range),
    salesByItem: (range: ReportRange) => invoke<SalesByItemRow[]>('reports:salesByItem', range),
    salesByCategory: (range: ReportRange) =>
      invoke<SalesByCategoryRow[]>('reports:salesByCategory', range),
    transactions: (range: ReportRange) => invoke<TransactionRow[]>('reports:transactions', range),
    auditLog: (query: AuditLogQuery) => invoke<AuditRow[]>('reports:auditLog', query),
    inventoryValuation: () => invoke<InventoryValuationReport>('reports:inventoryValuation'),
    exportExcel: (payload: ExcelExport) => invoke<string | null>('reports:exportExcel', payload)
  },
  ledger: {
    summary: () => invoke<LedgerCustomer[]>('ledger:summary'),
    entries: (query: LedgerEntryQuery) => invoke<LedgerEntryRow[]>('ledger:entries', query),
    payment: (input: LedgerPaymentInput) => invoke<number>('ledger:payment', input)
  },
  users: {
    list: () => invoke<UserRow[]>('users:list'),
    create: (input: UserCreateInput) => invoke<number>('users:create', input),
    update: (id: number, input: UserUpdateInput) => invoke<true>('users:update', { id, input }),
    setPassword: (id: number, password: string) =>
      invoke<true>('users:setPassword', { id, password })
  },
  roles: {
    list: () => invoke<RoleRow[]>('roles:list'),
    create: (input: RoleInput) => invoke<number>('roles:create', input),
    update: (id: number, input: RoleInput) => invoke<true>('roles:update', { id, input }),
    remove: (id: number) => invoke<true>('roles:delete', id)
  },
  backup: {
    now: () => invoke<BackupFile>('backup:now'),
    list: () => invoke<BackupFile[]>('backup:list'),
    getFolder: () => invoke<string>('backup:getFolder'),
    /** Native folder picker; returns the chosen (resolved) folder or null if cancelled. */
    chooseFolder: () => invoke<string | null>('backup:chooseFolder'),
    /** Save a one-off copy via a native save dialog (e.g. to USB); null if cancelled. */
    saveAs: () => invoke<string | null>('backup:saveAs'),
    /** Restore a backup (path from the list, or omit to open a file picker). Relaunches the app. */
    restore: (path?: string) => invoke<true>('backup:restore', { path })
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
