<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useToast } from '@/composables/useToast'
import { useSettingsStore } from '@/stores/settings'
import { buildReceiptHtml, defaultReceiptTemplate } from '@/utils/receipt'
import type { ReceiptElement, ReceiptElementType, ReceiptTemplate, SaleReceipt } from '../../../shared/types'

const toast = useToast()
const settings = useSettingsStore()

// CSS reference: 96px per inch → px per millimetre. Lets the ruler line up with
// the iframe, which renders physical mm at the same reference.
const PX_PER_MM = 96 / 25.4

const LABELS: Record<ReceiptElementType, string> = {
  logo: 'Logo',
  store_name: 'Store name',
  store_address: 'Address',
  header: 'Header text',
  sale_info: 'Sale no. & date',
  cashier: 'Cashier',
  customer: 'Customer',
  sd_info: 'Senior / PWD ID',
  items: 'Items',
  totals: 'Totals & VAT',
  payments: 'Payments',
  change: 'Change',
  footer: 'Footer text',
  custom: 'Custom line',
  divider: 'Divider ----',
  spacer: 'Blank line'
}
const ALIGNABLE = new Set<ReceiptElementType>(['logo', 'store_name', 'store_address', 'header', 'footer', 'custom'])
const BOLDABLE = new Set<ReceiptElementType>(['store_name', 'store_address', 'header', 'footer', 'custom'])
const DELETABLE = new Set<ReceiptElementType>(['custom', 'divider', 'spacer'])

const template = reactive<ReceiptTemplate>({ width_mm: 80, elements: [] })
const busy = ref(false)
let idc = 0

onMounted(async () => {
  await settings.loadAppSettings()
  let loaded: ReceiptTemplate | null = null
  if (settings.app.receipt_template) {
    try {
      const t = JSON.parse(settings.app.receipt_template) as ReceiptTemplate
      if (t && Array.isArray(t.elements)) loaded = t
    } catch {
      loaded = null
    }
  }
  const tpl = loaded ?? defaultReceiptTemplate(Number(settings.app.receipt_width_mm || 80))
  template.width_mm = tpl.width_mm
  template.elements = tpl.elements
})

// -- Sample sale for the preview ------------------------------------------------
const SAMPLE: SaleReceipt = {
  id: 0,
  sale_no: 'SI2026-000123',
  datetime: '2026-06-13 10:30:00',
  subtotal: 25000,
  discount: 2500,
  voucher_discount: 0,
  tax: 2411,
  total: 22500,
  amount_paid: 25000,
  change: 2500,
  payment_type: 'cash',
  status: 'completed',
  customer_name: 'Juan dela Cruz',
  cashier: 'Maria Santos',
  sd_type: '',
  sd_name: '',
  sd_id: '',
  lines: [
    { name: 'Chicken Inasal', qty: 2, unit: 'pc', price: 9000, line_discount: 0, line_total: 18000, promo_name: null },
    { name: 'Steamed Rice', qty: 2, unit: 'cup', price: 2500, line_discount: 0, line_total: 5000, promo_name: null },
    { name: 'Iced Tea', qty: 1, unit: 'glass', price: 2000, line_discount: 0, line_total: 2000, promo_name: null }
  ],
  payments: [{ method: 'cash', amount: 25000 }]
}

const previewHtml = computed(() =>
  buildReceiptHtml(SAMPLE, settings.app, settings.branding, {
    width_mm: Number(template.width_mm) || 80,
    elements: template.elements
  })
)

// -- Rulers ---------------------------------------------------------------------
const frame = ref<HTMLIFrameElement | null>(null)
const contentHeightPx = ref(240)

function onFrameLoad(): void {
  const doc = frame.value?.contentDocument
  if (doc?.body) contentHeightPx.value = Math.max(doc.body.scrollHeight, 80)
}
watch(previewHtml, () => nextTick(() => onFrameLoad()))

const pxWidth = computed(() => (Number(template.width_mm) || 80) * PX_PER_MM)
const ticksTop = computed(() => {
  const out: number[] = []
  for (let mm = 0; mm <= (Number(template.width_mm) || 80); mm += 5) out.push(mm)
  return out
})
const ticksRight = computed(() => {
  const out: number[] = []
  const totalMm = Math.ceil(contentHeightPx.value / PX_PER_MM)
  for (let mm = 0; mm <= totalMm; mm += 5) out.push(mm)
  return out
})

// -- Element editing ------------------------------------------------------------
function addEl(type: ReceiptElementType): void {
  template.elements.push({
    id: `el_${++idc}_${type}`,
    type,
    enabled: true,
    align: type === 'custom' ? 'center' : undefined,
    text: type === 'custom' ? 'Thank you, come again!' : undefined
  })
}
function move(i: number, dir: -1 | 1): void {
  const j = i + dir
  if (j < 0 || j >= template.elements.length) return
  const [el] = template.elements.splice(i, 1)
  template.elements.splice(j, 0, el)
}
function remove(i: number): void {
  template.elements.splice(i, 1)
}
function resetDefault(): void {
  template.elements = defaultReceiptTemplate(Number(template.width_mm) || 80).elements
}

async function save(): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    const width = String(Math.max(Number(template.width_mm) || 80, 20))
    const json = JSON.stringify({
      width_mm: Number(width),
      elements: template.elements.map((e) => ({ ...e }))
    })
    await window.api.settings.set('receipt_template', json)
    await window.api.settings.set('receipt_width_mm', width)
    settings.setAppSettings({ receipt_template: json, receipt_width_mm: width })
    toast.success('Receipt layout saved')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Save failed')
  } finally {
    busy.value = false
  }
}

function showAlign(el: ReceiptElement): boolean {
  return ALIGNABLE.has(el.type)
}
function showBold(el: ReceiptElement): boolean {
  return BOLDABLE.has(el.type)
}
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-[1fr_auto]">
    <!-- Editor -->
    <div class="space-y-4">
      <div class="flex flex-wrap items-end gap-3">
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Paper width (mm)</label>
          <input v-model.number="template.width_mm" type="number" min="20" max="120" step="1" class="input w-28" />
        </div>
        <div class="ml-auto flex gap-2">
          <button class="btn-secondary" @click="resetDefault">Reset to default</button>
          <button class="btn-primary" :disabled="busy" @click="save">
            {{ busy ? 'Saving…' : 'Save layout' }}
          </button>
        </div>
      </div>

      <div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <ul class="divide-y divide-gray-100">
          <li
            v-for="(el, i) in template.elements"
            :key="el.id"
            class="flex items-center gap-2 px-3 py-2"
            :class="el.enabled ? '' : 'opacity-50'"
          >
            <div class="flex flex-col">
              <button class="text-xs text-gray-400 hover:text-gray-700" :disabled="i === 0" @click="move(i, -1)">▲</button>
              <button
                class="text-xs text-gray-400 hover:text-gray-700"
                :disabled="i === template.elements.length - 1"
                @click="move(i, 1)"
              >▼</button>
            </div>
            <input v-model="el.enabled" type="checkbox" class="h-4 w-4 rounded accent-accent" />

            <div class="min-w-0 flex-1">
              <input
                v-if="el.type === 'custom'"
                v-model="el.text"
                type="text"
                placeholder="Custom text…"
                class="input w-full px-2 py-1 text-sm"
              />
              <span v-else class="text-sm font-medium text-gray-800">{{ LABELS[el.type] }}</span>
            </div>

            <select
              v-if="showAlign(el)"
              :value="el.align ?? 'left'"
              class="input w-24 px-2 py-1 text-xs"
              @change="el.align = ($event.target as HTMLSelectElement).value as 'left' | 'center' | 'right'"
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
            <label v-if="showBold(el)" class="flex items-center gap-1 text-xs text-gray-500">
              <input v-model="el.bold" type="checkbox" class="h-3.5 w-3.5 rounded accent-accent" />B
            </label>

            <button
              v-if="DELETABLE.has(el.type)"
              class="text-gray-300 transition-colors duration-100 hover:text-red-600"
              aria-label="Remove element"
              @click="remove(i)"
            >
              ✕
            </button>
            <span v-else class="w-4"></span>
          </li>
        </ul>
      </div>

      <div class="flex flex-wrap gap-2">
        <button class="btn-secondary px-3 py-1.5 text-xs" @click="addEl('custom')">+ Custom line</button>
        <button class="btn-secondary px-3 py-1.5 text-xs" @click="addEl('divider')">+ Divider</button>
        <button class="btn-secondary px-3 py-1.5 text-xs" @click="addEl('spacer')">+ Blank line</button>
      </div>
      <p class="text-xs text-gray-400">
        Toggle elements on/off, reorder with ▲▼, and add custom lines. Standard elements only show
        when the sale has that data (e.g. Customer, Senior/PWD).
      </p>
    </div>

    <!-- Live preview with rulers -->
    <div>
      <p class="mb-2 text-sm font-medium text-gray-700">Preview (mm)</p>
      <div class="inline-block rounded-lg bg-gray-100 p-3">
        <!-- top ruler -->
        <div class="relative ml-0 h-5" :style="{ width: pxWidth + 'px' }">
          <div
            v-for="mm in ticksTop"
            :key="'t' + mm"
            class="absolute bottom-0 border-l border-gray-400"
            :style="{ left: mm * PX_PER_MM + 'px', height: mm % 10 === 0 ? '8px' : '4px' }"
          >
            <span v-if="mm % 10 === 0" class="absolute -top-3.5 -left-1 text-[8px] text-gray-500">{{ mm }}</span>
          </div>
        </div>
        <div class="flex">
          <iframe
            ref="frame"
            :srcdoc="previewHtml"
            class="border border-gray-300 bg-white"
            :style="{ width: pxWidth + 'px', height: contentHeightPx + 'px' }"
            @load="onFrameLoad"
          />
          <!-- right ruler -->
          <div class="relative ml-1 w-6" :style="{ height: contentHeightPx + 'px' }">
            <div
              v-for="mm in ticksRight"
              :key="'r' + mm"
              class="absolute left-0 border-t border-gray-400"
              :style="{ top: mm * PX_PER_MM + 'px', width: mm % 10 === 0 ? '8px' : '4px' }"
            >
              <span v-if="mm % 10 === 0" class="absolute left-2.5 -top-1.5 text-[8px] text-gray-500">{{ mm }}</span>
            </div>
          </div>
        </div>
        <p class="mt-2 text-[10px] text-gray-400">Sample sale · {{ template.width_mm }}mm wide</p>
      </div>
    </div>
  </div>
</template>
