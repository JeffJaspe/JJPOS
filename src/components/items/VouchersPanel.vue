<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import JsBarcode from 'jsbarcode'
import AppModal from '@/components/ui/AppModal.vue'
import { useToast } from '@/composables/useToast'
import { formatPeso, pesosToCentavos } from '@/utils/money'
import { formatDateTime, localInputToUtc } from '@/utils/datetime'
import { isValidEan13 } from '../../../shared/barcode'
import type { Voucher, VoucherStatus, VoucherType } from '../../../shared/types'

const toast = useToast()

const vouchers = ref<Voucher[]>([])
const statusFilter = ref<VoucherStatus | 'all'>('all')

const formOpen = ref(false)
const error = ref('')
const busy = ref(false)
const form = reactive({
  count: 1,
  type: 'fixed' as VoucherType,
  value: '',
  expiresAt: '',
  note: ''
})

async function load(): Promise<void> {
  vouchers.value = await window.api.vouchers.list(statusFilter.value)
}
onMounted(load)
watch(statusFilter, load)

function openNew(): void {
  Object.assign(form, { count: 1, type: 'fixed', value: '', expiresAt: '', note: '' })
  error.value = ''
  formOpen.value = true
}

async function create(): Promise<void> {
  if (busy.value) return
  error.value = ''
  busy.value = true
  try {
    const created = await window.api.vouchers.create({
      count: Math.trunc(form.count) || 1,
      type: form.type,
      value: form.type === 'percent' ? Math.trunc(Number(form.value) || 0) : pesosToCentavos(form.value),
      expires_at: localInputToUtc(form.expiresAt),
      note: form.note
    })
    toast.success(`Issued ${created.length} voucher${created.length === 1 ? '' : 's'}`)
    formOpen.value = false
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Issue failed'
  } finally {
    busy.value = false
  }
}

async function cancel(voucher: Voucher): Promise<void> {
  try {
    await window.api.vouchers.cancel(voucher.id)
    toast.success(`Cancelled ${voucher.code}`)
    await load()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Cancel failed')
  }
}

function barcodeSvgMarkup(code: string): string {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  JsBarcode(svg, code, {
    format: isValidEan13(code) ? 'EAN13' : 'CODE128',
    height: 40,
    width: 2,
    fontSize: 14,
    margin: 0
  })
  const w = Number.parseFloat(svg.getAttribute('width') ?? '0')
  const h = Number.parseFloat(svg.getAttribute('height') ?? '0')
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
  svg.removeAttribute('width')
  svg.removeAttribute('height')
  return svg.outerHTML
}

/** Print one voucher label (50×30mm page) via the system print dialog. */
async function printVoucher(voucher: Voucher): Promise<void> {
  const valueText =
    voucher.type === 'percent' ? `${voucher.value}% OFF` : formatPeso(voucher.value)
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @page { size: 50mm 30mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; }
  .label { width: 50mm; height: 30mm; padding: 1mm 2mm; display: flex; flex-direction: column;
           align-items: center; justify-content: space-evenly; overflow: hidden; }
  .label svg { height: 13mm; max-width: 46mm; }
  p { font-size: 9pt; font-weight: 700; }
</style></head>
<body><div class="label">
  <p>GIFT VOUCHER — ${valueText}</p>
  ${barcodeSvgMarkup(voucher.code)}
  ${voucher.expires_at ? `<p style="font-weight:400;font-size:7pt">valid until ${formatDateTime(voucher.expires_at)}</p>` : ''}
</div></body></html>`
  try {
    const sent = await window.api.print.html(html)
    if (!sent) toast.info('Printing cancelled')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Print failed')
  }
}

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  redeemed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-gray-100 text-gray-500'
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-3">
      <select v-model="statusFilter" class="input max-w-40">
        <option value="all">All statuses</option>
        <option value="active">Active</option>
        <option value="redeemed">Redeemed</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <p class="text-sm text-gray-500">Scan a voucher at POS to deduct it from the total.</p>
      <button class="btn-primary ml-auto" @click="openNew">Issue Vouchers</button>
    </div>

    <div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
          <tr>
            <th class="px-4 py-3">Code</th>
            <th class="px-4 py-3">Value</th>
            <th class="px-4 py-3">Expires</th>
            <th class="px-4 py-3 text-center">Status</th>
            <th class="px-4 py-3">Note</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <TransitionGroup name="rows" tag="tbody" class="divide-y divide-gray-100">
          <tr v-for="v in vouchers" :key="v.id">
            <td class="px-4 py-2.5 font-mono text-xs">{{ v.code }}</td>
            <td class="px-4 py-2.5 font-medium tabular-nums">
              {{ v.type === 'percent' ? v.value + '%' : formatPeso(v.value) }}
            </td>
            <td class="px-4 py-2.5 text-gray-500">
              {{ v.expires_at ? formatDateTime(v.expires_at) : 'Never' }}
            </td>
            <td class="px-4 py-2.5 text-center">
              <span class="rounded-full px-2 py-0.5 text-xs" :class="STATUS_STYLE[v.status]">
                {{ v.status }}
              </span>
            </td>
            <td class="max-w-40 truncate px-4 py-2.5 text-gray-500">{{ v.note || '—' }}</td>
            <td class="px-4 py-2.5 text-right whitespace-nowrap">
              <button
                class="mr-3 text-sm font-medium text-accent transition-colors duration-100 hover:opacity-80"
                @click="printVoucher(v)"
              >
                Print
              </button>
              <button
                v-if="v.status === 'active'"
                class="text-sm font-medium text-gray-500 transition-colors duration-100 hover:text-red-600"
                @click="cancel(v)"
              >
                Cancel
              </button>
            </td>
          </tr>
        </TransitionGroup>
      </table>
      <p v-if="vouchers.length === 0" class="py-10 text-center text-sm text-gray-400">
        No vouchers {{ statusFilter === 'all' ? 'yet' : `with status “${statusFilter}”` }}.
      </p>
    </div>

    <!-- Issue modal -->
    <AppModal :open="formOpen" title="Issue Vouchers" @close="formOpen = false">
      <form id="voucher-form" class="grid grid-cols-2 gap-4" @submit.prevent="create">
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">How many</label>
          <input v-model.number="form.count" type="number" min="1" max="100" class="input" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Type</label>
          <select v-model="form.type" class="input">
            <option value="fixed">Fixed amount</option>
            <option value="percent">Percent of total</option>
          </select>
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">
            {{ form.type === 'percent' ? 'Percent (%)' : 'Amount (₱)' }}
          </label>
          <input v-model="form.value" type="number" min="0" step="0.01" required class="input" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Expires (optional)</label>
          <input v-model="form.expiresAt" type="datetime-local" class="input" />
        </div>
        <div class="col-span-2">
          <label class="mb-1 block text-sm font-medium text-gray-700">Note</label>
          <input v-model="form.note" type="text" class="input" placeholder="e.g. Christmas raffle prizes" />
        </div>
        <p v-if="error" class="col-span-2 text-sm text-red-600" role="alert">{{ error }}</p>
      </form>
      <template #footer>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn-secondary" @click="formOpen = false">Cancel</button>
          <button type="submit" form="voucher-form" :disabled="busy" class="btn-primary">
            {{ busy ? 'Issuing…' : 'Issue' }}
          </button>
        </div>
      </template>
    </AppModal>
  </div>
</template>
