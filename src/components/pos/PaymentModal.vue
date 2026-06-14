<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppModal from '@/components/ui/AppModal.vue'
import { useSettingsStore } from '@/stores/settings'
import { centavosToInput, formatPeso, pesosToCentavos } from '@/utils/money'
import type { CustomerRow, PaymentInput, PaymentMethod } from '../../../shared/types'

const props = defineProps<{
  open: boolean
  total: number
  /** When true, a customer must be selected even for non-charge payments. */
  requireCustomer?: boolean
}>()

const emit = defineEmits<{
  close: []
  confirm: [payments: PaymentInput[], customerId: number | null]
}>()

const settings = useSettingsStore()

/** Offered tenders: cash & charge always; card/GCash/PayMaya per Settings → Payments. */
const methods = computed<{ value: PaymentMethod; label: string }[]>(() => {
  const a = settings.app
  const list: { value: PaymentMethod; label: string }[] = [{ value: 'cash', label: 'Cash' }]
  if ((a.card_enabled ?? '1') === '1') list.push({ value: 'card', label: 'Card' })
  if ((a.gcash_enabled ?? '1') === '1') list.push({ value: 'gcash', label: 'GCash' })
  if ((a.paymaya_enabled ?? '1') === '1') list.push({ value: 'paymaya', label: 'PayMaya' })
  list.push({ value: 'charge', label: 'Charge' })
  return list
})

interface PayRow {
  method: PaymentMethod
  amount: string
}

const rows = ref<PayRow[]>([])
const customers = ref<CustomerRow[]>([])
const customerId = ref<number | null>(null)
const busy = ref(false)

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    rows.value = [{ method: 'cash', amount: centavosToInput(props.total) }]
    customerId.value = null
    busy.value = false
    customers.value = await window.api.customers.list({})
  }
)

const paid = computed(() => rows.value.reduce((n, r) => n + pesosToCentavos(r.amount), 0))
const change = computed(() => paid.value - props.total)
const hasCharge = computed(() => rows.value.some((r) => r.method === 'charge'))
const needsCustomer = computed(() => hasCharge.value || !!props.requireCustomer)
const canConfirm = computed(
  () => paid.value >= props.total && (!needsCustomer.value || customerId.value !== null) && !busy.value
)

function addRow(): void {
  rows.value.push({ method: 'cash', amount: '' })
}

function removeRow(index: number): void {
  if (rows.value.length > 1) rows.value.splice(index, 1)
}

function quickCash(centavos: number): void {
  rows.value = [{ method: 'cash', amount: centavosToInput(centavos) }]
}

const QUICK = [2000, 5000, 10000, 20000, 50000, 100000]

function confirm(): void {
  if (!canConfirm.value) return
  busy.value = true
  const payments: PaymentInput[] = rows.value
    .map((r) => ({ method: r.method, amount: pesosToCentavos(r.amount) }))
    .filter((p) => p.amount > 0)
  emit('confirm', payments, needsCustomer.value ? customerId.value : null)
}

defineExpose({ stopBusy: () => (busy.value = false) })
</script>

<template>
  <AppModal :open="open" title="Payment" width="max-w-xl" @close="emit('close')">
    <div class="space-y-4">
      <div class="rounded-lg bg-gray-900 px-4 py-3 text-center">
        <p class="text-xs font-medium tracking-widest text-gray-400 uppercase">Amount due</p>
        <p class="text-5xl font-bold text-white tabular-nums">{{ formatPeso(total) }}</p>
      </div>

      <!-- Quick cash -->
      <div class="flex flex-wrap gap-2">
        <button
          class="btn-secondary px-3 py-1.5 text-xs"
          @click="quickCash(total)"
        >
          Exact
        </button>
        <button
          v-for="q in QUICK"
          :key="q"
          class="btn-secondary px-3 py-1.5 text-xs"
          :disabled="q < total"
          @click="quickCash(q)"
        >
          {{ formatPeso(q) }}
        </button>
      </div>

      <!-- Payment rows (split-capable) -->
      <div class="space-y-2">
        <div v-for="(row, i) in rows" :key="i" class="flex items-center gap-2">
          <select v-model="row.method" class="input w-32">
            <option v-for="m in methods" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
          <input
            v-model="row.amount"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            class="input flex-1 text-right text-lg font-semibold tabular-nums"
            @keydown.enter.prevent="confirm"
          />
          <button
            v-if="rows.length > 1"
            class="text-gray-400 transition-colors duration-100 hover:text-red-600"
            aria-label="Remove payment row"
            @click="removeRow(i)"
          >
            ✕
          </button>
        </div>
        <button class="text-sm font-medium text-accent hover:opacity-80" @click="addRow">
          + Split payment
        </button>
      </div>

      <!-- Customer (required for charge sales, or when the account requires one) -->
      <div v-if="needsCustomer">
        <label class="mb-1 block text-sm font-medium text-gray-700">
          {{ hasCharge ? 'Charge to customer *' : 'Customer *' }}
        </label>
        <select v-model="customerId" class="input">
          <option :value="null">— Select customer —</option>
          <option v-for="c in customers" :key="c.id" :value="c.id">
            {{ c.code }} — {{ c.name }}
          </option>
        </select>
      </div>

      <!-- Change -->
      <div
        class="rounded-lg px-4 py-2 text-center"
        :class="change >= 0 ? 'bg-green-50' : 'bg-red-50'"
      >
        <p class="text-xs font-medium tracking-widest uppercase"
          :class="change >= 0 ? 'text-green-700' : 'text-red-700'"
        >
          {{ change >= 0 ? 'Change' : 'Short' }}
        </p>
        <p
          class="text-4xl font-bold tabular-nums"
          :class="change >= 0 ? 'text-green-700' : 'text-red-700'"
        >
          {{ formatPeso(Math.abs(change)) }}
        </p>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn-secondary" @click="emit('close')">Cancel</button>
        <button type="button" class="btn-primary px-8" :disabled="!canConfirm" @click="confirm">
          {{ busy ? 'Processing…' : 'Complete Sale' }}
        </button>
      </div>
    </template>
  </AppModal>
</template>
