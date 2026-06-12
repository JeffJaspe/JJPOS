<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import AppModal from '@/components/ui/AppModal.vue'
import { useToast } from '@/composables/useToast'
import { centavosToInput, pesosToCentavos } from '@/utils/money'
import type { CustomerInput, CustomerRow } from '../../../shared/types'

const props = defineProps<{
  open: boolean
  /** null = create a new customer */
  customer: CustomerRow | null
}>()

const emit = defineEmits<{ close: []; saved: [] }>()

const toast = useToast()

const TERMS = [
  { value: 0, label: 'COD' },
  { value: 7, label: '7 days' },
  { value: 15, label: '15 days' },
  { value: 30, label: '30 days' }
]

interface FormState {
  code: string
  name: string
  contact: string
  address: string
  tin: string
  creditLimit: string
  terms_days: number
  openingBalance: string
  active: boolean
}

const form = reactive<FormState>(blank())
const error = ref('')
const busy = ref(false)

function blank(): FormState {
  return {
    code: '',
    name: '',
    contact: '',
    address: '',
    tin: '',
    creditLimit: '',
    terms_days: 0,
    openingBalance: '',
    active: true
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    error.value = ''
    Object.assign(form, blank())
    if (props.customer) {
      Object.assign(form, {
        code: props.customer.code,
        name: props.customer.name,
        contact: props.customer.contact,
        address: props.customer.address,
        tin: props.customer.tin,
        creditLimit: centavosToInput(props.customer.credit_limit),
        terms_days: props.customer.terms_days,
        openingBalance: centavosToInput(props.customer.opening_balance),
        active: props.customer.active === 1
      })
    }
  }
)

async function save(): Promise<void> {
  if (busy.value) return
  error.value = ''
  busy.value = true
  try {
    const input: CustomerInput = {
      code: form.code,
      name: form.name,
      contact: form.contact,
      address: form.address,
      tin: form.tin,
      credit_limit: pesosToCentavos(form.creditLimit),
      terms_days: Number(form.terms_days),
      opening_balance: pesosToCentavos(form.openingBalance),
      active: form.active ? 1 : 0
    }
    if (props.customer === null) {
      await window.api.customers.create(input)
      toast.success('Customer created')
    } else {
      await window.api.customers.update(props.customer.id, input)
      toast.success('Customer saved')
    }
    emit('saved')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Save failed'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AppModal
    :open="open"
    :title="customer === null ? 'New Customer' : 'Edit Customer'"
    width="max-w-xl"
    @close="emit('close')"
  >
    <form id="customer-form" class="grid grid-cols-2 gap-4" @submit.prevent="save">
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Code *</label>
        <input v-model="form.code" type="text" required class="input" />
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Name *</label>
        <input v-model="form.name" type="text" required class="input" />
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Contact</label>
        <input v-model="form.contact" type="text" class="input" />
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">TIN</label>
        <input v-model="form.tin" type="text" class="input" />
      </div>

      <div class="col-span-2">
        <label class="mb-1 block text-sm font-medium text-gray-700">Address</label>
        <input v-model="form.address" type="text" class="input" />
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Credit limit (₱)</label>
        <input
          v-model="form.creditLimit"
          type="number"
          min="0"
          step="0.01"
          placeholder="0 = no credit"
          class="input"
        />
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Payment terms</label>
        <select v-model.number="form.terms_days" class="input">
          <option v-for="t in TERMS" :key="t.value" :value="t.value">{{ t.label }}</option>
        </select>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Opening balance (₱)</label>
        <input
          v-model="form.openingBalance"
          type="number"
          step="0.01"
          class="input"
          :disabled="customer !== null"
          :title="customer !== null ? 'Set at creation; adjust via the ledger' : undefined"
        />
        <p v-if="customer !== null" class="mt-1 text-xs text-gray-400">
          Set at creation — adjust via the ledger.
        </p>
      </div>
      <div class="flex items-end pb-2">
        <label class="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input v-model="form.active" type="checkbox" class="h-4 w-4 rounded accent-accent" />
          Active
        </label>
      </div>

      <p v-if="error" class="col-span-2 text-sm text-red-600" role="alert">{{ error }}</p>
    </form>

    <template #footer>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn-secondary" @click="emit('close')">Cancel</button>
        <button type="submit" form="customer-form" :disabled="busy" class="btn-primary">
          {{ busy ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </template>
  </AppModal>
</template>
