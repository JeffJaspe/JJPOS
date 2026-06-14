<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import ARPaymentModal from '@/components/ledger/ARPaymentModal.vue'
import { usePermissions } from '@/composables/usePermissions'
import { useReportExport } from '@/composables/useReportExport'
import { formatPeso } from '@/utils/money'
import { dayRangeToUtc, formatDate, formatDateTime } from '@/utils/datetime'
import type { LedgerCustomer, LedgerEntryRow } from '../../shared/types'

const { can } = usePermissions()
const canCollect = can('manage_ledger')
const { exportExcel, printReport } = useReportExport()

const customers = ref<LedgerCustomer[]>([])
const search = ref('')
const selected = ref<LedgerCustomer | null>(null)

const entries = ref<LedgerEntryRow[]>([])
const from = ref('')
const to = ref('')
const typeFilter = ref('')
const loadingEntries = ref(false)

const payOpen = ref(false)

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  check: 'Check',
  pdc: 'PDC',
  card: 'Card',
  ewallet: 'E-wallet',
  gcash: 'GCash',
  paymaya: 'PayMaya'
}
const TYPE_LABELS: Record<string, string> = {
  charge: 'Charge',
  payment: 'Payment',
  adj: 'Adjustment'
}

const filteredCustomers = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return customers.value
  return customers.value.filter(
    (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
  )
})

async function loadSummary(): Promise<void> {
  customers.value = await window.api.ledger.summary()
  if (selected.value) {
    selected.value = customers.value.find((c) => c.id === selected.value!.id) ?? null
  }
}

function bounds(): { fromUtc: string | null; toUtc: string | null } {
  if (from.value && to.value) {
    const r = dayRangeToUtc(from.value, to.value)
    return { fromUtc: r.fromUtc, toUtc: r.toUtc }
  }
  if (from.value) return { fromUtc: dayRangeToUtc(from.value, from.value).fromUtc, toUtc: null }
  if (to.value) return { fromUtc: null, toUtc: dayRangeToUtc(to.value, to.value).toUtc }
  return { fromUtc: null, toUtc: null }
}

async function loadEntries(): Promise<void> {
  if (!selected.value) {
    entries.value = []
    return
  }
  loadingEntries.value = true
  try {
    const { fromUtc, toUtc } = bounds()
    entries.value = await window.api.ledger.entries({
      customerId: selected.value.id,
      fromUtc,
      toUtc,
      type: typeFilter.value
    })
  } finally {
    loadingEntries.value = false
  }
}

function select(c: LedgerCustomer): void {
  selected.value = c
  loadEntries()
}

function onPaid(): void {
  payOpen.value = false
  loadSummary()
  loadEntries()
}

onMounted(loadSummary)
watch([from, to, typeFilter], loadEntries)

// --- Export / print ----------------------------------------------------------
function rangeLabel(): string {
  if (from.value && to.value) return `${formatDate(`${from.value} 00:00:00`)} – ${formatDate(`${to.value} 00:00:00`)}`
  if (from.value) return `from ${formatDate(`${from.value} 00:00:00`)}`
  if (to.value) return `to ${formatDate(`${to.value} 00:00:00`)}`
  return 'all dates'
}
function methodDetail(r: LedgerEntryRow): string {
  if (!r.method) return ''
  const m = METHOD_LABELS[r.method] ?? r.method
  if (r.method === 'check' || r.method === 'pdc') {
    const parts = [m]
    if (r.bank) parts.push(r.bank)
    if (r.check_no) parts.push(`#${r.check_no}`)
    if (r.check_date) parts.push(`iss ${r.check_date}`)
    if (r.check_due_date) parts.push(`due ${r.check_due_date}`)
    return parts.join(' · ')
  }
  return m
}

function printSOA(): void {
  if (!selected.value) return
  printReport({
    title: 'Statement of Account',
    subtitle: `${selected.value.code} — ${selected.value.name} · ${rangeLabel()}`,
    columns: [
      { label: 'Date' },
      { label: 'Reference' },
      { label: 'Type' },
      { label: 'Charge', align: 'right' },
      { label: 'Payment', align: 'right' },
      { label: 'Balance', align: 'right' }
    ],
    rows: entries.value.map((r) => [
      formatDateTime(r.datetime),
      [r.ref_no, methodDetail(r)].filter(Boolean).join(' · '),
      TYPE_LABELS[r.type] ?? r.type,
      r.debit ? formatPeso(r.debit) : '',
      r.credit ? formatPeso(r.credit) : '',
      formatPeso(r.balance)
    ])
  })
}

function exportXlsx(): void {
  if (!selected.value) return
  exportExcel({
    fileName: `ledger_${selected.value.code}.xlsx`,
    sheetName: 'Statement',
    title: `Statement of Account — ${selected.value.name} (${rangeLabel()})`,
    columns: [
      { header: 'Date', key: 'date', width: 22 },
      { header: 'Reference', key: 'ref', width: 26 },
      { header: 'Type', key: 'type', width: 12 },
      { header: 'Charge', key: 'debit', width: 14, format: 'money' },
      { header: 'Payment', key: 'credit', width: 14, format: 'money' },
      { header: 'Balance', key: 'balance', width: 14, format: 'money' }
    ],
    rows: entries.value.map((r) => ({
      date: formatDateTime(r.datetime),
      ref: [r.ref_no, methodDetail(r)].filter(Boolean).join(' · '),
      type: TYPE_LABELS[r.type] ?? r.type,
      debit: r.debit / 100,
      credit: r.credit / 100,
      balance: r.balance / 100
    }))
  })
}
</script>

<template>
  <div class="flex min-h-0 flex-1 gap-4">
    <!-- Customer list -->
    <div class="flex w-72 shrink-0 flex-col gap-2">
      <input v-model="search" type="text" placeholder="Search customers…" class="input" />
      <div class="min-h-0 flex-1 overflow-y-auto rounded-lg border border-gray-200 bg-white">
        <button
          v-for="c in filteredCustomers"
          :key="c.id"
          class="flex w-full items-center justify-between border-b border-gray-100 px-3 py-2.5 text-left transition-colors duration-100 last:border-0"
          :class="selected?.id === c.id ? 'bg-accent/10' : 'hover:bg-gray-50'"
          @click="select(c)"
        >
          <span class="min-w-0">
            <span class="block truncate text-sm font-medium text-gray-900">{{ c.name }}</span>
            <span class="font-mono text-xs text-gray-400">{{ c.code }}</span>
          </span>
          <span
            class="ml-2 shrink-0 text-sm font-semibold tabular-nums"
            :class="c.balance > 0 ? 'text-rose-600' : 'text-gray-400'"
          >
            {{ formatPeso(c.balance) }}
          </span>
        </button>
        <p v-if="filteredCustomers.length === 0" class="py-8 text-center text-sm text-gray-400">
          No customers.
        </p>
      </div>
    </div>

    <!-- Detail -->
    <div class="flex min-w-0 flex-1 flex-col gap-3">
      <div v-if="!selected" class="flex flex-1 items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-400">
        Select a customer to view their statement.
      </div>

      <template v-else>
        <!-- Header + actions -->
        <div class="flex flex-wrap items-center gap-3">
          <div>
            <h2 class="text-lg font-semibold text-gray-900">{{ selected.name }}</h2>
            <p class="text-xs text-gray-400">
              {{ selected.code
              }}<span v-if="selected.credit_limit > 0"> · limit {{ formatPeso(selected.credit_limit) }}</span>
            </p>
          </div>
          <div class="ml-auto flex gap-2">
            <button
              v-if="canCollect"
              class="btn-primary"
              @click="payOpen = true"
            >
              Record Payment
            </button>
            <button class="btn-secondary" @click="printSOA">Print SOA</button>
            <button class="btn-secondary" @click="exportXlsx">Export Excel</button>
          </div>
        </div>

        <!-- Aging -->
        <div class="grid grid-cols-2 gap-2 md:grid-cols-5">
          <div class="rounded-lg border border-accent bg-accent/5 p-3">
            <p class="text-xs text-gray-500">Balance</p>
            <p class="text-lg font-semibold tabular-nums text-accent">{{ formatPeso(selected.balance) }}</p>
          </div>
          <div class="rounded-lg border border-gray-200 bg-white p-3">
            <p class="text-xs text-gray-500">Current</p>
            <p class="text-lg font-semibold tabular-nums">{{ formatPeso(selected.current) }}</p>
          </div>
          <div class="rounded-lg border border-gray-200 bg-white p-3">
            <p class="text-xs text-gray-500">31–60</p>
            <p class="text-lg font-semibold tabular-nums">{{ formatPeso(selected.d30) }}</p>
          </div>
          <div class="rounded-lg border border-gray-200 bg-white p-3">
            <p class="text-xs text-gray-500">61–90</p>
            <p class="text-lg font-semibold tabular-nums">{{ formatPeso(selected.d60) }}</p>
          </div>
          <div class="rounded-lg border border-gray-200 bg-white p-3">
            <p class="text-xs text-gray-500">90+</p>
            <p class="text-lg font-semibold tabular-nums text-rose-600">{{ formatPeso(selected.d90) }}</p>
          </div>
        </div>

        <!-- Filters -->
        <div class="flex flex-wrap items-center gap-2">
          <input v-model="from" type="date" class="input max-w-40" />
          <span class="text-gray-400">to</span>
          <input v-model="to" type="date" class="input max-w-40" />
          <select v-model="typeFilter" class="input max-w-40">
            <option value="">All entries</option>
            <option value="charge">Charges</option>
            <option value="payment">Payments</option>
            <option value="adj">Adjustments</option>
          </select>
          <button
            v-if="from || to || typeFilter"
            class="text-sm font-medium text-accent hover:opacity-80"
            @click="((from = ''), (to = ''), (typeFilter = ''))"
          >
            Clear
          </button>
        </div>

        <!-- Entries -->
        <div class="min-h-0 flex-1 overflow-y-auto rounded-lg border border-gray-200 bg-white">
          <table class="w-full text-sm">
            <thead class="sticky top-0 bg-gray-50 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
              <tr>
                <th class="px-4 py-2.5">Date</th>
                <th class="px-4 py-2.5">Reference</th>
                <th class="px-4 py-2.5">Type</th>
                <th class="px-4 py-2.5 text-right">Charge</th>
                <th class="px-4 py-2.5 text-right">Payment</th>
                <th class="px-4 py-2.5 text-right">Balance</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="r in entries" :key="r.id">
                <td class="px-4 py-2 whitespace-nowrap text-gray-600">{{ formatDateTime(r.datetime) }}</td>
                <td class="px-4 py-2 text-gray-600">
                  {{ r.ref_no || '—' }}
                  <span v-if="methodDetail(r)" class="ml-1 text-xs text-gray-400">{{ methodDetail(r) }}</span>
                </td>
                <td class="px-4 py-2">
                  <span
                    class="rounded-full px-2 py-0.5 text-xs font-medium"
                    :class="
                      r.type === 'payment'
                        ? 'bg-green-100 text-green-700'
                        : r.type === 'charge'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-100 text-gray-500'
                    "
                  >
                    {{ TYPE_LABELS[r.type] ?? r.type }}
                  </span>
                </td>
                <td class="px-4 py-2 text-right tabular-nums">{{ r.debit ? formatPeso(r.debit) : '' }}</td>
                <td class="px-4 py-2 text-right tabular-nums text-green-700">
                  {{ r.credit ? formatPeso(r.credit) : '' }}
                </td>
                <td class="px-4 py-2 text-right font-medium tabular-nums">{{ formatPeso(r.balance) }}</td>
              </tr>
              <tr v-if="!loadingEntries && entries.length === 0">
                <td colspan="6" class="px-4 py-10 text-center text-gray-400">No entries.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>

    <ARPaymentModal :open="payOpen" :customer="selected" @close="payOpen = false" @saved="onPaid" />
  </div>
</template>
