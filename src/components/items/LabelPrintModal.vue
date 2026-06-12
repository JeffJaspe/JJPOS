<script setup lang="ts">
import { ref, watch } from 'vue'
import JsBarcode from 'jsbarcode'
import AppModal from '@/components/ui/AppModal.vue'
import { useToast } from '@/composables/useToast'
import { formatPeso } from '@/utils/money'
import { isValidEan13 } from '../../../shared/barcode'
import type { ItemDetail, ItemRow } from '../../../shared/types'

const props = defineProps<{
  open: boolean
  item: ItemRow | null
}>()

const emit = defineEmits<{ close: [] }>()

const toast = useToast()

const detail = ref<ItemDetail | null>(null)
const selectedBarcode = ref('')
const copies = ref(1)
// Label stock size is a per-terminal preference; 50×30mm is common thermal stock.
const widthMm = ref(Number(localStorage.getItem('labels:widthMm')) || 50)
const heightMm = ref(Number(localStorage.getItem('labels:heightMm')) || 30)

const previewDoc = ref('')
const printBusy = ref(false)

watch(
  () => props.open,
  async (open) => {
    if (!open || !props.item) return
    copies.value = 1
    previewDoc.value = ''
    detail.value = await window.api.items.get(props.item.id)
    selectedBarcode.value = detail.value.barcodes[0] ?? ''
    refreshPreview()
  }
)

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Render the barcode to scalable SVG markup (viewBox, no fixed px size). */
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

function clampCopies(): number {
  return Math.min(Math.max(Math.round(copies.value) || 1, 1), 500)
}

/**
 * Self-contained document for the print pipeline: @page is exactly one label,
 * so dedicated label printers (Zebra/TSC-style drivers) get one label per page.
 * forPreview adds screen-only chrome (page outlines); print output is identical.
 */
function buildHtml(forPreview = false): string {
  const item = detail.value!
  const w = widthMm.value
  const h = heightMm.value
  const barcodeHeight = Math.max(h * 0.45, 8)
  const label = `<div class="label">
    <p class="name">${escapeHtml(item.name)}</p>
    ${barcodeSvgMarkup(selectedBarcode.value)}
    <p class="price">${formatPeso(item.sell_price)}</p>
  </div>`
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { size: ${w}mm ${h}mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, system-ui, sans-serif; }
  .label {
    width: ${w}mm;
    height: ${h}mm;
    padding: 1mm 2mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-evenly;
    overflow: hidden;
    page-break-after: always;
  }
  .label svg { height: ${barcodeHeight}mm; max-width: ${w - 4}mm; }
  .name {
    font-size: 8pt;
    max-width: ${w - 4}mm;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .price { font-size: 10pt; font-weight: 700; }
  ${
    forPreview
      ? `body { background: #e5e7eb; padding: 6px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .label { background: white; outline: 1px solid #9ca3af; box-shadow: 0 1px 2px rgb(0 0 0 / 0.2); }`
      : ''
  }
</style>
</head>
<body>${label.repeat(clampCopies())}</body>
</html>`
}

watch([selectedBarcode, copies, widthMm, heightMm], () => {
  if (!props.open || !detail.value) return
  localStorage.setItem('labels:widthMm', String(widthMm.value))
  localStorage.setItem('labels:heightMm', String(heightMm.value))
  refreshPreview()
})

/** Same document, same engine — what the iframe shows is what prints. */
function refreshPreview(): void {
  previewDoc.value = detail.value && selectedBarcode.value ? buildHtml(true) : ''
}

async function print(): Promise<void> {
  if (printBusy.value || !selectedBarcode.value) return
  printBusy.value = true
  try {
    const sent = await window.api.print.html(buildHtml())
    if (sent) {
      toast.success(`Sent ${clampCopies()} label${clampCopies() === 1 ? '' : 's'} to printer`)
      emit('close')
    } else {
      toast.info('Printing cancelled')
    }
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Print failed')
  } finally {
    printBusy.value = false
  }
}
</script>

<template>
  <AppModal :open="open" title="Print Labels" width="max-w-3xl" @close="emit('close')">
    <div v-if="detail" class="space-y-4">
      <p class="text-sm text-gray-700">
        <span class="font-medium">{{ detail.name }}</span>
        — {{ formatPeso(detail.sell_price) }}
      </p>

      <div
        v-if="detail.barcodes.length === 0"
        class="rounded-md bg-amber-50 p-3 text-sm text-amber-800"
      >
        This item has no barcode yet. Add or generate one from the item form first.
      </div>

      <div v-else class="grid grid-cols-5 gap-4">
        <!-- Controls -->
        <div class="col-span-2 space-y-3">
          <div>
            <label class="mb-1 block text-sm font-medium text-gray-700">Barcode</label>
            <select v-model="selectedBarcode" class="input">
              <option v-for="code in detail.barcodes" :key="code" :value="code">{{ code }}</option>
            </select>
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-gray-700">Copies</label>
            <input v-model.number="copies" type="number" min="1" max="500" class="input" />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700">Label W (mm)</label>
              <input v-model.number="widthMm" type="number" min="20" max="120" class="input" />
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700">Label H (mm)</label>
              <input v-model.number="heightMm" type="number" min="10" max="120" class="input" />
            </div>
          </div>
          <p class="text-xs text-gray-500">
            Each label prints as its own page sized {{ widthMm }}×{{ heightMm }} mm — set your
            label printer's stock size to match.
          </p>
        </div>

        <!-- Exact print preview (paginated PDF) -->
        <div class="col-span-3">
          <div class="mb-1 flex items-center justify-between">
            <span class="text-sm font-medium text-gray-700">Print preview</span>
            <span class="text-xs text-gray-400">1 page per label</span>
          </div>
          <div class="h-72 overflow-hidden rounded-lg border border-gray-300 bg-gray-200">
            <iframe
              v-if="previewDoc"
              :srcdoc="previewDoc"
              sandbox=""
              class="h-full w-full"
              title="Label print preview"
            />
            <div v-else class="flex h-full items-center justify-center text-sm text-gray-400">
              Preview appears here
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <button type="button" class="btn-secondary" @click="emit('close')">Close</button>
        <button
          type="button"
          class="btn-primary"
          :disabled="!selectedBarcode || printBusy"
          @click="print"
        >
          {{ printBusy ? 'Printing…' : 'Print…' }}
        </button>
      </div>
    </template>
  </AppModal>
</template>
