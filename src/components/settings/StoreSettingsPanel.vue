<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useToast } from '@/composables/useToast'
import { useSettingsStore } from '@/stores/settings'

const toast = useToast()
const settings = useSettingsStore()

interface FormState {
  store_name: string
  store_address: string
  receipt_header: string
  receipt_footer: string
  vat_rate: string
  vat_mode: string
  sale_prefix: string
  nextNumber: string
  receipt_printer: string
  receipt_auto_print: boolean
}

const form = reactive<FormState>({
  store_name: '',
  store_address: '',
  receipt_header: '',
  receipt_footer: '',
  vat_rate: '12',
  vat_mode: 'per_item',
  sale_prefix: 'SI-',
  nextNumber: '1',
  receipt_printer: '',
  receipt_auto_print: true
})
const printers = ref<{ name: string; displayName: string }[]>([])
const busy = ref(false)
const error = ref('')

/** sale_sequence holds the last used number; the next one is +1. */
function currentNext(): number {
  return Number(settings.app.sale_sequence ?? 0) + 1
}

onMounted(async () => {
  await settings.loadAppSettings()
  const a = settings.app
  Object.assign(form, {
    store_name: a.store_name ?? '',
    store_address: a.store_address ?? '',
    receipt_header: a.receipt_header ?? '',
    receipt_footer: a.receipt_footer ?? '',
    vat_rate: a.vat_rate ?? '12',
    vat_mode: a.vat_mode ?? 'per_item',
    sale_prefix: a.sale_prefix ?? 'SI-',
    nextNumber: String(currentNext()),
    receipt_printer: a.receipt_printer ?? '',
    receipt_auto_print: (a.receipt_auto_print ?? '1') === '1'
  })
  try {
    printers.value = await window.api.print.listPrinters()
  } catch {
    printers.value = []
  }
})

async function save(): Promise<void> {
  if (busy.value) return
  error.value = ''

  const vat = Number(form.vat_rate)
  if (!Number.isFinite(vat) || vat < 0 || vat > 100) {
    error.value = 'VAT rate must be between 0 and 100'
    return
  }
  const next = Number(form.nextNumber)
  if (!Number.isInteger(next) || next < 1) {
    error.value = 'Next invoice number must be a positive whole number'
    return
  }

  busy.value = true
  try {
    const kv: Record<string, string> = {
      store_name: form.store_name.trim(),
      store_address: form.store_address.trim(),
      receipt_header: form.receipt_header.trim(),
      receipt_footer: form.receipt_footer.trim(),
      vat_rate: String(vat),
      vat_mode: form.vat_mode === 'overall' ? 'overall' : 'per_item',
      sale_prefix: form.sale_prefix.trim() || 'SI-',
      receipt_printer: form.receipt_printer,
      receipt_auto_print: form.receipt_auto_print ? '1' : '0'
    }
    for (const [key, value] of Object.entries(kv)) {
      await window.api.settings.set(key, value)
    }
    // Invoice number goes through its own guarded handler (forward-only).
    if (next !== currentNext()) {
      await window.api.settings.setInvoiceNumber(next)
    }
    settings.setAppSettings({ ...kv, sale_sequence: String(next - 1) })
    form.sale_prefix = kv.sale_prefix
    toast.success('Store settings saved')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Save failed'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl space-y-6">
    <!-- Store identity -->
    <section class="space-y-4">
      <h3 class="text-sm font-semibold text-gray-900">Store details</h3>
      <div class="grid grid-cols-2 gap-4">
        <div class="col-span-2">
          <label class="mb-1 block text-sm font-medium text-gray-700">Store name</label>
          <input v-model="form.store_name" type="text" class="input" />
        </div>
        <div class="col-span-2">
          <label class="mb-1 block text-sm font-medium text-gray-700">Address</label>
          <input v-model="form.store_address" type="text" class="input" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Receipt header</label>
          <input v-model="form.receipt_header" type="text" class="input" placeholder="e.g. VAT Reg TIN" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Receipt footer</label>
          <input v-model="form.receipt_footer" type="text" class="input" />
        </div>
      </div>
    </section>

    <!-- VAT -->
    <section class="space-y-4 border-t border-gray-100 pt-5">
      <h3 class="text-sm font-semibold text-gray-900">VAT</h3>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">VAT rate (%)</label>
          <input v-model="form.vat_rate" type="number" min="0" max="100" step="0.01" class="input" />
          <p class="mt-1 text-xs text-gray-400">Changes affect future sales only.</p>
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">VAT mode</label>
          <select v-model="form.vat_mode" class="input">
            <option value="per_item">Per item (use each item's VAT flag)</option>
            <option value="overall">Overall (whole sale is VATable)</option>
          </select>
          <p class="mt-1 text-xs text-gray-400">
            “Overall” suits restaurants; “Per item” suits mixed VAT/non-VAT retail.
          </p>
        </div>
      </div>
    </section>

    <!-- Receipt printing -->
    <section class="space-y-4 border-t border-gray-100 pt-5">
      <h3 class="text-sm font-semibold text-gray-900">Receipt printing</h3>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Receipt printer</label>
          <select v-model="form.receipt_printer" class="input">
            <option value="">System default</option>
            <option v-for="p in printers" :key="p.name" :value="p.name">{{ p.displayName }}</option>
          </select>
        </div>
        <div class="flex items-end pb-2">
          <label class="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input v-model="form.receipt_auto_print" type="checkbox" class="h-4 w-4 rounded accent-accent" />
            Auto-print after each sale
          </label>
        </div>
      </div>
      <p class="text-xs text-gray-400">Paper width and layout are set in the “Receipt” tab.</p>
    </section>

    <!-- Invoice numbering -->
    <section class="space-y-4 border-t border-gray-100 pt-5">
      <h3 class="text-sm font-semibold text-gray-900">Invoice numbering (BIR)</h3>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Invoice prefix</label>
          <input v-model="form.sale_prefix" type="text" class="input" placeholder="SI-" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Next SI number</label>
          <input v-model="form.nextNumber" type="number" min="1" step="1" class="input" />
          <p class="mt-1 text-xs text-gray-400">
            Next receipt:
            <span class="font-mono">{{ form.sale_prefix || 'SI-' }}{{ String(Math.max(Number(form.nextNumber) || 1, 1)).padStart(6, '0') }}</span>
            · forward-only
          </p>
        </div>
      </div>
    </section>

    <p v-if="error" class="text-sm text-red-600" role="alert">{{ error }}</p>

    <div class="border-t border-gray-100 pt-5">
      <button class="btn-primary px-8" :disabled="busy" @click="save">
        {{ busy ? 'Saving…' : 'Save store settings' }}
      </button>
    </div>
  </div>
</template>
