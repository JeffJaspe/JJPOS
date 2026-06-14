<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { usePermissions } from '@/composables/usePermissions'
import { useReportExport, type PrintReport } from '@/composables/useReportExport'
import { formatPeso } from '@/utils/money'
import { dayRangeToUtc, formatDate, formatDateTime, todayLocal } from '@/utils/datetime'
import type {
  AuditCategory,
  AuditRow,
  DailySalesReport,
  ExcelExport,
  InventoryValuationReport,
  SalesByCategoryRow,
  SalesByItemRow,
  TransactionRow
} from '../../shared/types'

const { can } = usePermissions()
const canExport = can('export_reports')
const canAudit = can('view_audit')
const { exportExcel, printReport } = useReportExport()

type Tab =
  | 'Daily Sales'
  | 'Transactions'
  | 'By Item'
  | 'By Category'
  | 'Profit'
  | 'Inventory'
  | 'Audit'
const TABS: Tab[] = []
if (canExport) TABS.push('Daily Sales', 'Transactions', 'By Item', 'By Category', 'Profit', 'Inventory')
if (canAudit) TABS.push('Audit')
const tab = ref<Tab>(TABS[0] ?? 'Daily Sales')

const AUDIT_OPTIONS: { value: AuditCategory; label: string }[] = [
  { value: 'all', label: 'All activity' },
  { value: 'logins', label: 'User logins' },
  { value: 'overrides', label: 'Manager key approvals' },
  { value: 'voids', label: 'Voids' },
  { value: 'discounts', label: 'Discounts' }
]
const auditCategory = ref<AuditCategory>('all')
const audit = ref<AuditRow[]>([])

const ACTION_LABELS: Record<string, string> = {
  login: 'Login',
  logout: 'Logout',
  void: 'Void sale',
  price_override: 'Price override',
  senior_pwd_discount: 'Senior/PWD discount',
  override: 'Supervisor override',
  ar_payment: 'AR payment',
  user_create: 'User created',
  user_update: 'User updated',
  user_password_reset: 'Password reset',
  role_create: 'Role created',
  role_update: 'Role updated',
  role_delete: 'Role deleted',
  branding_update: 'Branding updated',
  invoice_number_set: 'Invoice number set',
  stock_in: 'Stock in',
  stock_adjust: 'Stock adjust',
  stocktake: 'Stocktake'
}
const actionLabel = (a: string): string => ACTION_LABELS[a] ?? a
const auditCategoryLabel = (): string =>
  AUDIT_OPTIONS.find((o) => o.value === auditCategory.value)?.label ?? 'All'

// Client-side filters over the loaded audit rows (instant, no extra round-trip).
const auditAction = ref('')
const auditUser = ref('')
const auditSearch = ref('')
const auditActions = computed(() =>
  [...new Set(audit.value.map((r) => r.action))]
    .sort()
    .map((a) => ({ value: a, label: actionLabel(a) }))
)
const auditUsers = computed(() => [...new Set(audit.value.map((r) => r.user ?? '—'))].sort())
const filteredAudit = computed(() => {
  const q = auditSearch.value.trim().toLowerCase()
  return audit.value.filter((r) => {
    if (auditAction.value && r.action !== auditAction.value) return false
    if (auditUser.value && (r.user ?? '—') !== auditUser.value) return false
    if (q) {
      const hay = `${r.user ?? ''} ${actionLabel(r.action)} ${r.action} ${r.detail}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
})

const from = ref(todayLocal())
const to = ref(todayLocal())
const loading = ref(false)

const daily = ref<DailySalesReport | null>(null)
const transactions = ref<TransactionRow[]>([])
const byItem = ref<SalesByItemRow[]>([])
const byCategory = ref<SalesByCategoryRow[]>([])
const inventory = ref<InventoryValuationReport | null>(null)

const PESO = (c: number): number => Math.round(c) / 100
const margin = (sales: number, profit: number): number => (sales > 0 ? (profit / sales) * 100 : 0)
const fmtPct = (n: number): string => `${n.toFixed(1)}%`

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  ewallet: 'E-wallet',
  gcash: 'GCash',
  paymaya: 'PayMaya',
  charge: 'Charge to account',
  split: 'Split'
}
const methodLabel = (m: string): string => METHOD_LABELS[m] ?? m

const rangeLabel = computed(() =>
  from.value === to.value
    ? formatDate(`${from.value} 00:00:00`)
    : `${formatDate(`${from.value} 00:00:00`)} – ${formatDate(`${to.value} 00:00:00`)}`
)

function setPreset(preset: 'today' | 'week' | 'month'): void {
  const now = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  const iso = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (preset === 'today') {
    from.value = iso(now)
    to.value = iso(now)
  } else if (preset === 'week') {
    const start = new Date(now)
    start.setDate(now.getDate() - now.getDay()) // Sunday
    from.value = iso(start)
    to.value = iso(now)
  } else {
    from.value = iso(new Date(now.getFullYear(), now.getMonth(), 1))
    to.value = iso(now)
  }
}

async function load(): Promise<void> {
  if (TABS.length === 0) return
  loading.value = true
  try {
    const range = dayRangeToUtc(from.value, to.value)
    if (tab.value === 'Audit') {
      audit.value = await window.api.reports.auditLog({ ...range, category: auditCategory.value })
      // Reset the dependent dropdowns; their options come from the new data.
      auditAction.value = ''
      auditUser.value = ''
    } else if (tab.value === 'Daily Sales') {
      daily.value = await window.api.reports.dailySales(range)
    } else if (tab.value === 'Transactions') {
      transactions.value = await window.api.reports.transactions(range)
    } else if (tab.value === 'By Item' || tab.value === 'Profit') {
      byItem.value = await window.api.reports.salesByItem(range)
    } else if (tab.value === 'By Category') {
      byCategory.value = await window.api.reports.salesByCategory(range)
    } else if (tab.value === 'Inventory') {
      inventory.value = await window.api.reports.inventoryValuation()
    }
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(tab, load)
let timer: ReturnType<typeof setTimeout> | undefined
watch([from, to], () => {
  clearTimeout(timer)
  timer = setTimeout(load, 200)
})
watch(auditCategory, () => {
  if (tab.value === 'Audit') load()
})

// --- Derived totals ------------------------------------------------------
const itemTotals = computed(() => ({
  qty: byItem.value.reduce((s, r) => s + r.qty, 0),
  sales: byItem.value.reduce((s, r) => s + r.sales, 0),
  cost: byItem.value.reduce((s, r) => s + r.cost, 0),
  profit: byItem.value.reduce((s, r) => s + r.profit, 0)
}))
const profitByItem = computed(() => [...byItem.value].sort((a, b) => b.profit - a.profit))

// --- Export / print ------------------------------------------------------
function doExportExcel(): void {
  const stamp = `${from.value}_${to.value}`
  if (tab.value === 'Daily Sales' && daily.value) {
    const d = daily.value
    const rows: Record<string, string | number>[] = [
      { label: 'Gross sales', amount: PESO(d.gross), count: '' },
      { label: 'Discounts', amount: PESO(-d.discount), count: '' },
      { label: 'Voucher discounts', amount: PESO(-d.voucherDiscount), count: '' },
      { label: 'VAT (included)', amount: PESO(d.tax), count: '' },
      { label: 'Net sales', amount: PESO(d.net), count: d.count },
      { label: 'Voided', amount: PESO(d.voidedAmount), count: d.voidedCount },
      { label: 'Payment methods', amount: '', count: '' },
      ...d.byPayment.map((p) => ({
        label: `  ${methodLabel(p.method)}`,
        amount: PESO(p.amount),
        count: p.count
      })),
      { label: 'Cashiers', amount: '', count: '' },
      ...d.byCashier.map((c) => ({ label: `  ${c.user}`, amount: PESO(c.net), count: c.count }))
    ]
    const payload: ExcelExport = {
      fileName: `daily-sales_${stamp}.xlsx`,
      sheetName: 'Daily Sales',
      title: `Daily Sales — ${rangeLabel.value}`,
      columns: [
        { header: 'Item', key: 'label', width: 30 },
        { header: 'Amount', key: 'amount', width: 16, format: 'money' },
        { header: 'Count', key: 'count', width: 10, format: 'int' }
      ],
      rows
    }
    exportExcel(payload)
  } else if (tab.value === 'Audit') {
    exportExcel({
      fileName: `audit-${auditCategory.value}_${stamp}.xlsx`,
      sheetName: 'Audit Log',
      title: `Audit — ${auditCategoryLabel()} — ${rangeLabel.value}`,
      columns: [
        { header: 'Date / time', key: 'datetime', width: 22 },
        { header: 'User', key: 'user', width: 20 },
        { header: 'Action', key: 'action', width: 22 },
        { header: 'Detail', key: 'detail', width: 50 }
      ],
      rows: filteredAudit.value.map((r) => ({
        datetime: formatDateTime(r.datetime),
        user: r.user ?? '',
        action: actionLabel(r.action),
        detail: r.detail
      }))
    })
  } else if (tab.value === 'Transactions') {
    exportExcel({
      fileName: `transactions_${stamp}.xlsx`,
      sheetName: 'Transactions',
      title: `Transactions — ${rangeLabel.value}`,
      columns: [
        { header: 'Sale no.', key: 'sale_no', width: 14 },
        { header: 'Date / time', key: 'datetime', width: 22 },
        { header: 'Cashier', key: 'cashier', width: 20 },
        { header: 'Customer', key: 'customer', width: 22 },
        { header: 'Payment', key: 'payment', width: 12 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Total', key: 'total', width: 14, format: 'money' }
      ],
      rows: transactions.value.map((t) => ({
        sale_no: t.sale_no,
        datetime: formatDateTime(t.datetime),
        cashier: t.cashier,
        customer: t.customer ?? '',
        payment: t.payment_type,
        status: t.status,
        total: PESO(t.total)
      }))
    })
  } else if (tab.value === 'By Item' || tab.value === 'Profit') {
    const src = tab.value === 'Profit' ? profitByItem.value : byItem.value
    exportExcel({
      fileName: `sales-by-item_${stamp}.xlsx`,
      sheetName: tab.value === 'Profit' ? 'Profit by Item' : 'Sales by Item',
      title: `${tab.value === 'Profit' ? 'Profit' : 'Sales'} by Item — ${rangeLabel.value}`,
      columns: [
        { header: 'SKU', key: 'sku', width: 16 },
        { header: 'Item', key: 'name', width: 30 },
        { header: 'Qty', key: 'qty', width: 8, format: 'int' },
        { header: 'Sales', key: 'sales', width: 14, format: 'money' },
        { header: 'Cost', key: 'cost', width: 14, format: 'money' },
        { header: 'Profit', key: 'profit', width: 14, format: 'money' },
        { header: 'Margin', key: 'marginPct', width: 10, format: 'percent' }
      ],
      rows: src.map((r) => ({
        sku: r.sku,
        name: r.name,
        qty: r.qty,
        sales: PESO(r.sales),
        cost: PESO(r.cost),
        profit: PESO(r.profit),
        marginPct: margin(r.sales, r.profit)
      }))
    })
  } else if (tab.value === 'By Category') {
    exportExcel({
      fileName: `sales-by-category_${stamp}.xlsx`,
      sheetName: 'Sales by Category',
      title: `Sales by Category — ${rangeLabel.value}`,
      columns: [
        { header: 'Category', key: 'category', width: 26 },
        { header: 'Qty', key: 'qty', width: 8, format: 'int' },
        { header: 'Sales', key: 'sales', width: 14, format: 'money' },
        { header: 'Cost', key: 'cost', width: 14, format: 'money' },
        { header: 'Profit', key: 'profit', width: 14, format: 'money' },
        { header: 'Margin', key: 'marginPct', width: 10, format: 'percent' }
      ],
      rows: byCategory.value.map((r) => ({
        category: r.category,
        qty: r.qty,
        sales: PESO(r.sales),
        cost: PESO(r.cost),
        profit: PESO(r.profit),
        marginPct: margin(r.sales, r.profit)
      }))
    })
  } else if (tab.value === 'Inventory' && inventory.value) {
    exportExcel({
      fileName: `inventory-valuation_${todayLocal()}.xlsx`,
      sheetName: 'Inventory Valuation',
      title: `Inventory Valuation — ${formatDate(`${todayLocal()} 00:00:00`)}`,
      columns: [
        { header: 'SKU', key: 'sku', width: 16 },
        { header: 'Item', key: 'name', width: 30 },
        { header: 'Unit', key: 'unit', width: 8 },
        { header: 'On hand', key: 'qty', width: 10, format: 'int' },
        { header: 'Cost', key: 'cost', width: 12, format: 'money' },
        { header: 'Cost value', key: 'costValue', width: 14, format: 'money' },
        { header: 'Retail value', key: 'retailValue', width: 14, format: 'money' }
      ],
      rows: inventory.value.rows.map((r) => ({
        sku: r.sku,
        name: r.name,
        unit: r.unit,
        qty: r.qty_on_hand,
        cost: PESO(r.cost_price),
        costValue: PESO(r.cost_value),
        retailValue: PESO(r.retail_value)
      }))
    })
  }
}

function doPrint(): void {
  let report: PrintReport | null = null
  if (tab.value === 'Daily Sales' && daily.value) {
    const d = daily.value
    const rows: string[][] = [
      ['Gross sales', formatPeso(d.gross), ''],
      ['Discounts', formatPeso(-d.discount), ''],
      ['Voucher discounts', formatPeso(-d.voucherDiscount), ''],
      ['VAT (included)', formatPeso(d.tax), ''],
      ['Net sales', formatPeso(d.net), String(d.count)],
      ['Voided', formatPeso(d.voidedAmount), String(d.voidedCount)],
      ['Payment methods', '', ''],
      ...d.byPayment.map((p) => [`  ${methodLabel(p.method)}`, formatPeso(p.amount), String(p.count)]),
      ['Cashiers', '', ''],
      ...d.byCashier.map((c) => [`  ${c.user}`, formatPeso(c.net), String(c.count)])
    ]
    report = {
      title: 'Daily Sales',
      subtitle: rangeLabel.value,
      columns: [{ label: 'Item' }, { label: 'Amount', align: 'right' }, { label: 'Count', align: 'right' }],
      rows
    }
  } else if (tab.value === 'Audit') {
    report = {
      title: `Audit — ${auditCategoryLabel()}`,
      subtitle: rangeLabel.value,
      columns: [
        { label: 'Date / time' },
        { label: 'User' },
        { label: 'Action' },
        { label: 'Detail' }
      ],
      rows: filteredAudit.value.map((r) => [
        formatDateTime(r.datetime),
        r.user ?? '',
        actionLabel(r.action),
        r.detail
      ])
    }
  } else if (tab.value === 'Transactions') {
    report = {
      title: 'Transactions',
      subtitle: rangeLabel.value,
      columns: [
        { label: 'Sale no.' },
        { label: 'Date / time' },
        { label: 'Cashier' },
        { label: 'Customer' },
        { label: 'Payment' },
        { label: 'Status' },
        { label: 'Total', align: 'right' }
      ],
      rows: transactions.value.map((t) => [
        t.sale_no,
        formatDateTime(t.datetime),
        t.cashier,
        t.customer ?? '',
        t.payment_type,
        t.status,
        formatPeso(t.total)
      ])
    }
  } else if (tab.value === 'By Item' || tab.value === 'Profit') {
    const src = tab.value === 'Profit' ? profitByItem.value : byItem.value
    report = {
      title: tab.value === 'Profit' ? 'Profit by Item' : 'Sales by Item',
      subtitle: rangeLabel.value,
      columns: [
        { label: 'SKU' },
        { label: 'Item' },
        { label: 'Qty', align: 'right' },
        { label: 'Sales', align: 'right' },
        { label: 'Cost', align: 'right' },
        { label: 'Profit', align: 'right' },
        { label: 'Margin', align: 'right' }
      ],
      rows: src.map((r) => [
        r.sku,
        r.name,
        String(r.qty),
        formatPeso(r.sales),
        formatPeso(r.cost),
        formatPeso(r.profit),
        fmtPct(margin(r.sales, r.profit))
      ])
    }
  } else if (tab.value === 'By Category') {
    report = {
      title: 'Sales by Category',
      subtitle: rangeLabel.value,
      columns: [
        { label: 'Category' },
        { label: 'Qty', align: 'right' },
        { label: 'Sales', align: 'right' },
        { label: 'Cost', align: 'right' },
        { label: 'Profit', align: 'right' },
        { label: 'Margin', align: 'right' }
      ],
      rows: byCategory.value.map((r) => [
        r.category,
        String(r.qty),
        formatPeso(r.sales),
        formatPeso(r.cost),
        formatPeso(r.profit),
        fmtPct(margin(r.sales, r.profit))
      ])
    }
  } else if (tab.value === 'Inventory' && inventory.value) {
    report = {
      title: 'Inventory Valuation',
      subtitle: formatDate(`${todayLocal()} 00:00:00`),
      columns: [
        { label: 'SKU' },
        { label: 'Item' },
        { label: 'Unit' },
        { label: 'On hand', align: 'right' },
        { label: 'Cost', align: 'right' },
        { label: 'Cost value', align: 'right' },
        { label: 'Retail value', align: 'right' }
      ],
      rows: inventory.value.rows.map((r) => [
        r.sku,
        r.name,
        r.unit,
        String(r.qty_on_hand),
        formatPeso(r.cost_price),
        formatPeso(r.cost_value),
        formatPeso(r.retail_value)
      ])
    }
  }
  if (report) printReport(report)
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="TABS.length === 0" class="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-700">
      You don't have permission to view reports (needs “View &amp; export reports” or “View audit
      &amp; security logs”).
    </div>

    <template v-else>
      <!-- Tabs -->
      <div class="flex gap-1 border-b border-gray-200">
        <button
          v-for="t in TABS"
          :key="t"
          class="border-b-2 px-4 py-2 text-sm font-medium transition-colors duration-100"
          :class="
            tab === t
              ? 'border-accent text-accent'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          "
          @click="tab = t"
        >
          {{ t }}
        </button>
      </div>

      <!-- Toolbar -->
      <div class="flex flex-wrap items-center gap-3">
        <template v-if="tab !== 'Inventory'">
          <input v-model="from" type="date" class="input max-w-40" />
          <span class="text-gray-400">to</span>
          <input v-model="to" type="date" class="input max-w-40" />
          <div class="flex gap-1">
            <button class="btn-secondary px-3 py-1.5 text-xs" @click="setPreset('today')">Today</button>
            <button class="btn-secondary px-3 py-1.5 text-xs" @click="setPreset('week')">This week</button>
            <button class="btn-secondary px-3 py-1.5 text-xs" @click="setPreset('month')">This month</button>
          </div>
        </template>
        <span v-else class="text-sm text-gray-500">Live snapshot of active items.</span>

        <select
          v-if="tab === 'Audit'"
          :value="auditCategory"
          class="input max-w-52"
          @change="auditCategory = ($event.target as HTMLSelectElement).value as AuditCategory"
        >
          <option v-for="o in AUDIT_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>

        <div class="ml-auto flex gap-2">
          <button class="btn-secondary" @click="doPrint">Print / PDF</button>
          <button class="btn-primary" @click="doExportExcel">Export Excel</button>
        </div>
      </div>

      <!-- Audit filters -->
      <div v-if="tab === 'Audit'" class="flex flex-wrap items-center gap-2">
        <select v-model="auditAction" class="input max-w-48">
          <option value="">All actions</option>
          <option v-for="a in auditActions" :key="a.value" :value="a.value">{{ a.label }}</option>
        </select>
        <select v-model="auditUser" class="input max-w-44">
          <option value="">All users</option>
          <option v-for="u in auditUsers" :key="u" :value="u">{{ u }}</option>
        </select>
        <input
          v-model="auditSearch"
          type="text"
          placeholder="Search user, action, or details…"
          class="input max-w-xs"
        />
        <span class="text-xs text-gray-400">{{ filteredAudit.length }} of {{ audit.length }}</span>
      </div>

      <p v-if="loading" class="text-sm text-gray-400">Loading…</p>

      <!-- Daily Sales (Z-reading) -->
      <template v-if="tab === 'Daily Sales' && daily">
        <div class="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div class="rounded-lg border border-gray-200 bg-white p-3">
            <p class="text-xs text-gray-500">Transactions</p>
            <p class="text-xl font-semibold tabular-nums">{{ daily.count }}</p>
          </div>
          <div class="rounded-lg border border-gray-200 bg-white p-3">
            <p class="text-xs text-gray-500">Gross</p>
            <p class="text-xl font-semibold tabular-nums">{{ formatPeso(daily.gross) }}</p>
          </div>
          <div class="rounded-lg border border-gray-200 bg-white p-3">
            <p class="text-xs text-gray-500">Discounts</p>
            <p class="text-xl font-semibold tabular-nums text-rose-600">−{{ formatPeso(daily.discount) }}</p>
          </div>
          <div class="rounded-lg border border-gray-200 bg-white p-3">
            <p class="text-xs text-gray-500">Vouchers</p>
            <p class="text-xl font-semibold tabular-nums text-rose-600">−{{ formatPeso(daily.voucherDiscount) }}</p>
          </div>
          <div class="rounded-lg border border-gray-200 bg-white p-3">
            <p class="text-xs text-gray-500">VAT (incl.)</p>
            <p class="text-xl font-semibold tabular-nums">{{ formatPeso(daily.tax) }}</p>
          </div>
          <div class="rounded-lg border border-accent bg-accent/5 p-3">
            <p class="text-xs text-gray-500">Net sales</p>
            <p class="text-xl font-semibold tabular-nums text-accent">{{ formatPeso(daily.net) }}</p>
          </div>
        </div>

        <p class="text-sm text-gray-500">
          Voided in period: <span class="font-medium text-gray-700">{{ daily.voidedCount }}</span>
          ({{ formatPeso(daily.voidedAmount) }})
        </p>

        <div class="grid gap-4 lg:grid-cols-2">
          <div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
                <tr>
                  <th class="px-4 py-2.5">Payment method</th>
                  <th class="px-4 py-2.5 text-right">Txns</th>
                  <th class="px-4 py-2.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr v-for="p in daily.byPayment" :key="p.method">
                  <td class="px-4 py-2">{{ methodLabel(p.method) }}</td>
                  <td class="px-4 py-2 text-right tabular-nums">{{ p.count }}</td>
                  <td class="px-4 py-2 text-right tabular-nums">{{ formatPeso(p.amount) }}</td>
                </tr>
                <tr v-if="daily.byPayment.length === 0">
                  <td colspan="3" class="px-4 py-6 text-center text-gray-400">No sales in range.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
                <tr>
                  <th class="px-4 py-2.5">Cashier</th>
                  <th class="px-4 py-2.5 text-right">Txns</th>
                  <th class="px-4 py-2.5 text-right">Net</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr v-for="c in daily.byCashier" :key="c.user">
                  <td class="px-4 py-2">{{ c.user }}</td>
                  <td class="px-4 py-2 text-right tabular-nums">{{ c.count }}</td>
                  <td class="px-4 py-2 text-right tabular-nums">{{ formatPeso(c.net) }}</td>
                </tr>
                <tr v-if="daily.byCashier.length === 0">
                  <td colspan="3" class="px-4 py-6 text-center text-gray-400">No sales in range.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>

      <!-- Transactions -->
      <div v-else-if="tab === 'Transactions'" class="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
            <tr>
              <th class="px-4 py-2.5">Sale no.</th>
              <th class="px-4 py-2.5">Date / time</th>
              <th class="px-4 py-2.5">Cashier</th>
              <th class="px-4 py-2.5">Customer</th>
              <th class="px-4 py-2.5">Payment</th>
              <th class="px-4 py-2.5">Status</th>
              <th class="px-4 py-2.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="t in transactions" :key="t.sale_no" :class="{ 'opacity-50': t.status === 'voided' }">
              <td class="px-4 py-2 font-mono text-xs">{{ t.sale_no }}</td>
              <td class="px-4 py-2 text-gray-600">{{ formatDateTime(t.datetime) }}</td>
              <td class="px-4 py-2 text-gray-600">{{ t.cashier }}</td>
              <td class="px-4 py-2 text-gray-500">{{ t.customer ?? '—' }}</td>
              <td class="px-4 py-2 text-gray-500 capitalize">{{ t.payment_type }}</td>
              <td class="px-4 py-2">
                <span
                  class="rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="t.status === 'voided' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'"
                >
                  {{ t.status }}
                </span>
              </td>
              <td class="px-4 py-2 text-right font-medium tabular-nums">{{ formatPeso(t.total) }}</td>
            </tr>
            <tr v-if="transactions.length === 0">
              <td colspan="7" class="px-4 py-10 text-center text-gray-400">No transactions in range.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Audit log -->
      <div v-else-if="tab === 'Audit'" class="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
            <tr>
              <th class="px-4 py-2.5">Date / time</th>
              <th class="px-4 py-2.5">User</th>
              <th class="px-4 py-2.5">Action</th>
              <th class="px-4 py-2.5">Detail</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="(r, i) in filteredAudit" :key="i">
              <td class="px-4 py-2 whitespace-nowrap text-gray-600">{{ formatDateTime(r.datetime) }}</td>
              <td class="px-4 py-2 text-gray-700">{{ r.user ?? '—' }}</td>
              <td class="px-4 py-2">
                <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  {{ actionLabel(r.action) }}
                </span>
              </td>
              <td class="px-4 py-2 text-gray-500">{{ r.detail }}</td>
            </tr>
            <tr v-if="filteredAudit.length === 0">
              <td colspan="4" class="px-4 py-10 text-center text-gray-400">
                {{ audit.length === 0 ? 'No activity in range.' : 'No rows match the filters.' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Sales by Item -->
      <div v-else-if="tab === 'By Item'" class="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
            <tr>
              <th class="px-4 py-2.5">SKU</th>
              <th class="px-4 py-2.5">Item</th>
              <th class="px-4 py-2.5 text-right">Qty</th>
              <th class="px-4 py-2.5 text-right">Sales</th>
              <th class="px-4 py-2.5 text-right">Cost</th>
              <th class="px-4 py-2.5 text-right">Profit</th>
              <th class="px-4 py-2.5 text-right">Margin</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="r in byItem" :key="r.item_id">
              <td class="px-4 py-2 font-mono text-xs">{{ r.sku }}</td>
              <td class="px-4 py-2 font-medium text-gray-900">{{ r.name }}</td>
              <td class="px-4 py-2 text-right tabular-nums">{{ r.qty }}</td>
              <td class="px-4 py-2 text-right tabular-nums">{{ formatPeso(r.sales) }}</td>
              <td class="px-4 py-2 text-right tabular-nums text-gray-500">{{ formatPeso(r.cost) }}</td>
              <td class="px-4 py-2 text-right font-medium tabular-nums">{{ formatPeso(r.profit) }}</td>
              <td class="px-4 py-2 text-right tabular-nums text-gray-500">{{ fmtPct(margin(r.sales, r.profit)) }}</td>
            </tr>
            <tr v-if="byItem.length === 0">
              <td colspan="7" class="px-4 py-10 text-center text-gray-400">No sales in range.</td>
            </tr>
          </tbody>
          <tfoot v-if="byItem.length" class="border-t-2 border-gray-200 font-semibold">
            <tr>
              <td class="px-4 py-2.5" colspan="2">Total</td>
              <td class="px-4 py-2.5 text-right tabular-nums">{{ itemTotals.qty }}</td>
              <td class="px-4 py-2.5 text-right tabular-nums">{{ formatPeso(itemTotals.sales) }}</td>
              <td class="px-4 py-2.5 text-right tabular-nums">{{ formatPeso(itemTotals.cost) }}</td>
              <td class="px-4 py-2.5 text-right tabular-nums">{{ formatPeso(itemTotals.profit) }}</td>
              <td class="px-4 py-2.5 text-right tabular-nums">{{ fmtPct(margin(itemTotals.sales, itemTotals.profit)) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Sales by Category -->
      <div v-else-if="tab === 'By Category'" class="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
            <tr>
              <th class="px-4 py-2.5">Category</th>
              <th class="px-4 py-2.5 text-right">Qty</th>
              <th class="px-4 py-2.5 text-right">Sales</th>
              <th class="px-4 py-2.5 text-right">Cost</th>
              <th class="px-4 py-2.5 text-right">Profit</th>
              <th class="px-4 py-2.5 text-right">Margin</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="(r, i) in byCategory" :key="i">
              <td class="px-4 py-2 font-medium text-gray-900">{{ r.category }}</td>
              <td class="px-4 py-2 text-right tabular-nums">{{ r.qty }}</td>
              <td class="px-4 py-2 text-right tabular-nums">{{ formatPeso(r.sales) }}</td>
              <td class="px-4 py-2 text-right tabular-nums text-gray-500">{{ formatPeso(r.cost) }}</td>
              <td class="px-4 py-2 text-right font-medium tabular-nums">{{ formatPeso(r.profit) }}</td>
              <td class="px-4 py-2 text-right tabular-nums text-gray-500">{{ fmtPct(margin(r.sales, r.profit)) }}</td>
            </tr>
            <tr v-if="byCategory.length === 0">
              <td colspan="6" class="px-4 py-10 text-center text-gray-400">No sales in range.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Profit -->
      <template v-else-if="tab === 'Profit'">
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div class="rounded-lg border border-gray-200 bg-white p-3">
            <p class="text-xs text-gray-500">Revenue</p>
            <p class="text-xl font-semibold tabular-nums">{{ formatPeso(itemTotals.sales) }}</p>
          </div>
          <div class="rounded-lg border border-gray-200 bg-white p-3">
            <p class="text-xs text-gray-500">Cost of goods</p>
            <p class="text-xl font-semibold tabular-nums text-gray-500">{{ formatPeso(itemTotals.cost) }}</p>
          </div>
          <div class="rounded-lg border border-accent bg-accent/5 p-3">
            <p class="text-xs text-gray-500">Gross profit</p>
            <p class="text-xl font-semibold tabular-nums text-accent">{{ formatPeso(itemTotals.profit) }}</p>
          </div>
          <div class="rounded-lg border border-gray-200 bg-white p-3">
            <p class="text-xs text-gray-500">Margin</p>
            <p class="text-xl font-semibold tabular-nums">{{ fmtPct(margin(itemTotals.sales, itemTotals.profit)) }}</p>
          </div>
        </div>

        <div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
              <tr>
                <th class="px-4 py-2.5">Item</th>
                <th class="px-4 py-2.5 text-right">Qty</th>
                <th class="px-4 py-2.5 text-right">Sales</th>
                <th class="px-4 py-2.5 text-right">Profit</th>
                <th class="px-4 py-2.5 text-right">Margin</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="r in profitByItem" :key="r.item_id">
                <td class="px-4 py-2 font-medium text-gray-900">{{ r.name }}</td>
                <td class="px-4 py-2 text-right tabular-nums">{{ r.qty }}</td>
                <td class="px-4 py-2 text-right tabular-nums">{{ formatPeso(r.sales) }}</td>
                <td class="px-4 py-2 text-right font-medium tabular-nums">{{ formatPeso(r.profit) }}</td>
                <td class="px-4 py-2 text-right tabular-nums text-gray-500">{{ fmtPct(margin(r.sales, r.profit)) }}</td>
              </tr>
              <tr v-if="profitByItem.length === 0">
                <td colspan="5" class="px-4 py-10 text-center text-gray-400">No sales in range.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <!-- Inventory valuation -->
      <template v-else-if="tab === 'Inventory' && inventory">
        <div class="grid grid-cols-2 gap-3 md:grid-cols-3">
          <div class="rounded-lg border border-gray-200 bg-white p-3">
            <p class="text-xs text-gray-500">Items</p>
            <p class="text-xl font-semibold tabular-nums">{{ inventory.rows.length }}</p>
          </div>
          <div class="rounded-lg border border-gray-200 bg-white p-3">
            <p class="text-xs text-gray-500">Stock at cost</p>
            <p class="text-xl font-semibold tabular-nums">{{ formatPeso(inventory.totalCostValue) }}</p>
          </div>
          <div class="rounded-lg border border-gray-200 bg-white p-3">
            <p class="text-xs text-gray-500">Stock at retail</p>
            <p class="text-xl font-semibold tabular-nums">{{ formatPeso(inventory.totalRetailValue) }}</p>
          </div>
        </div>

        <div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
              <tr>
                <th class="px-4 py-2.5">SKU</th>
                <th class="px-4 py-2.5">Item</th>
                <th class="px-4 py-2.5 text-right">On hand</th>
                <th class="px-4 py-2.5 text-right">Cost</th>
                <th class="px-4 py-2.5 text-right">Cost value</th>
                <th class="px-4 py-2.5 text-right">Retail value</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="r in inventory.rows" :key="r.id">
                <td class="px-4 py-2 font-mono text-xs">{{ r.sku }}</td>
                <td class="px-4 py-2 font-medium text-gray-900">{{ r.name }}</td>
                <td class="px-4 py-2 text-right tabular-nums">{{ r.qty_on_hand }} {{ r.unit }}</td>
                <td class="px-4 py-2 text-right tabular-nums text-gray-500">{{ formatPeso(r.cost_price) }}</td>
                <td class="px-4 py-2 text-right tabular-nums">{{ formatPeso(r.cost_value) }}</td>
                <td class="px-4 py-2 text-right tabular-nums">{{ formatPeso(r.retail_value) }}</td>
              </tr>
              <tr v-if="inventory.rows.length === 0">
                <td colspan="6" class="px-4 py-10 text-center text-gray-400">No active items.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </template>
  </div>
</template>
