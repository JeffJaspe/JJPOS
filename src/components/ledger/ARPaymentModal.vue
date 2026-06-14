<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import AppModal from '@/components/ui/AppModal.vue'
import { useToast } from '@/composables/useToast'
import { useSettingsStore } from '@/stores/settings'
import { formatPeso, pesosToCentavos } from '@/utils/money'
import { todayLocal } from '@/utils/datetime'
import type { LedgerCustomer, LedgerMethod, LedgerPaymentInput } from '../../../shared/types'

const props = defineProps<{ open: boolean; customer: LedgerCustomer | null }>()
const emit = defineEmits<{ close: []; saved: [] }>()

const toast = useToast()
const settings = useSettingsStore()

/** Cash + check + PDC always; card/GCash/PayMaya per Settings → Payments. */
const methods = computed<{ value: LedgerMethod; label: string }[]>(() => {
  const a = settings.app
  const list: { value: LedgerMethod; label: string }[] = [
    { value: 'cash', label: 'Cash' },
    { value: 'check', label: 'Check' },
    { value: 'pdc', label: 'Post-dated check (PDC)' }
  ]
  if ((a.card_enabled ?? '1') === '1') list.push({ value: 'card', label: 'Card' })
  if ((a.gcash_enabled ?? '1') === '1') list.push({ value: 'gcash', label: 'GCash' })
  if ((a.paymaya_enabled ?? '1') === '1') list.push({ value: 'paymaya', label: 'PayMaya' })
  return list
})

interface FormState {
  amount: string
  method: LedgerMethod
  or_no: string
  bank: string
  check_no: string
  check_date: string
  due_date: string
  note: string
}

const form = reactive<FormState>(blank())
const error = ref('')
const busy = ref(false)

const isCheck = computed(() => form.method === 'check' || form.method === 'pdc')
const isPdc = computed(() => form.method === 'pdc')
const cardReaderReady = computed(() => settings.app.card_reader_enabled === '1')

function blank(): FormState {
  return {
    amount: '',
    method: 'cash',
    or_no: '',
    bank: '',
    check_no: '',
    check_date: todayLocal(),
    due_date: '',
    note: ''
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    error.value = ''
    Object.assign(form, blank())
  }
)

async function save(): Promise<void> {
  if (busy.value || !props.customer) return
  error.value = ''
  const amount = pesosToCentavos(form.amount)
  if (amount <= 0) {
    error.value = 'Enter a valid amount'
    return
  }
  if (isCheck.value && !form.check_no.trim()) {
    error.value = 'Check number is required'
    return
  }
  busy.value = true
  try {
    const input: LedgerPaymentInput = {
      customer_id: props.customer.id,
      amount,
      method: form.method,
      or_no: form.or_no,
      bank: isCheck.value ? form.bank : '',
      check_no: isCheck.value ? form.check_no : '',
      check_date: isCheck.value ? form.check_date : '',
      due_date: isPdc.value ? form.due_date : '',
      note: form.note
    }
    await window.api.ledger.payment(input)
    toast.success(`Payment recorded for ${props.customer.name}`)
    emit('saved')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not record payment'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AppModal
    :open="open"
    :title="customer ? `Record Payment — ${customer.name}` : 'Record Payment'"
    width="max-w-md"
    @close="emit('close')"
  >
    <form id="ar-payment-form" class="space-y-4" @submit.prevent="save">
      <div v-if="customer" class="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm">
        <span class="text-gray-500">Outstanding balance</span>
        <span class="font-semibold tabular-nums" :class="customer.balance > 0 ? 'text-rose-600' : 'text-gray-700'">
          {{ formatPeso(customer.balance) }}
        </span>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Amount (₱) *</label>
          <input v-model="form.amount" type="number" min="0" step="0.01" class="input" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Method *</label>
          <select v-model="form.method" class="input">
            <option v-for="m in methods" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
        </div>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">OR / Receipt no.</label>
        <input v-model="form.or_no" type="text" class="input" placeholder="Official receipt number" />
      </div>

      <!-- Check / PDC details -->
      <div v-if="isCheck" class="space-y-4 rounded-lg border border-gray-200 p-3">
        <p class="text-xs font-semibold tracking-wide text-gray-500 uppercase">
          {{ isPdc ? 'Post-dated check' : 'Check' }} details
        </p>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="mb-1 block text-sm font-medium text-gray-700">Bank</label>
            <input v-model="form.bank" type="text" class="input" placeholder="Drawee bank" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-gray-700">Check no. *</label>
            <input v-model="form.check_no" type="text" class="input" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-gray-700">Date issued</label>
            <input v-model="form.check_date" type="date" class="input" />
          </div>
          <div v-if="isPdc">
            <label class="mb-1 block text-sm font-medium text-gray-700">Due date *</label>
            <input v-model="form.due_date" type="date" class="input" />
          </div>
        </div>
        <p v-if="isPdc" class="text-xs text-amber-600">
          Note: a PDC reduces the outstanding balance now; it isn't held until the due date.
        </p>
      </div>

      <p v-if="form.method === 'card'" class="rounded-md bg-gray-50 p-2 text-xs text-gray-500">
        {{
          cardReaderReady
            ? 'Card reader is enabled in Settings — swipe/insert the card on the terminal.'
            : 'No card reader configured. Enable one in Settings → Store, or record the reference manually.'
        }}
      </p>

      <p v-if="error" class="text-sm text-red-600" role="alert">{{ error }}</p>
    </form>

    <template #footer>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn-secondary" @click="emit('close')">Cancel</button>
        <button type="submit" form="ar-payment-form" :disabled="busy" class="btn-primary">
          {{ busy ? 'Saving…' : 'Record Payment' }}
        </button>
      </div>
    </template>
  </AppModal>
</template>
