<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import { useToast } from '@/composables/useToast'
import { centavosToInput, pesosToCentavos } from '@/utils/money'
import type { Category, ItemInput } from '../../../shared/types'

const props = defineProps<{
  open: boolean
  /** null = create a new item */
  itemId: number | null
  categories: Category[]
}>()

const emit = defineEmits<{ close: []; saved: [] }>()

const toast = useToast()

const UNITS = ['pc', 'box', 'kg', 'pack', 'set']

interface FormState {
  sku: string
  name: string
  description: string
  category_id: number | null
  unit: string
  cost: string
  sell: string
  wholesale: string
  reorder_level: number
  tax_type: 'vat' | 'non_vat'
  active: boolean
  barcodes: string[]
}

const form = reactive<FormState>(blank())
const barcodeInput = ref('')
const error = ref('')
const busy = ref(false)

function blank(): FormState {
  return {
    sku: '',
    name: '',
    description: '',
    category_id: null,
    unit: 'pc',
    cost: '',
    sell: '',
    wholesale: '',
    reorder_level: 0,
    tax_type: 'vat',
    active: true,
    barcodes: []
  }
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    error.value = ''
    barcodeInput.value = ''
    Object.assign(form, blank())
    if (props.itemId !== null) {
      const item = await window.api.items.get(props.itemId)
      Object.assign(form, {
        sku: item.sku,
        name: item.name,
        description: item.description,
        category_id: item.category_id,
        unit: item.unit,
        cost: centavosToInput(item.cost_price),
        sell: centavosToInput(item.sell_price),
        wholesale: centavosToInput(item.wholesale_price),
        reorder_level: item.reorder_level,
        tax_type: item.tax_type as 'vat' | 'non_vat',
        active: item.active === 1,
        barcodes: item.barcodes
      })
    }
  }
)

function addBarcode(): void {
  const code = barcodeInput.value.trim()
  if (!code) return
  if (form.barcodes.includes(code)) {
    toast.error('That barcode is already on this item')
  } else {
    form.barcodes.push(code)
  }
  barcodeInput.value = ''
}

function removeBarcode(code: string): void {
  form.barcodes = form.barcodes.filter((b) => b !== code)
}

async function generateBarcode(): Promise<void> {
  try {
    form.barcodes.push(await window.api.items.nextBarcode())
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Could not generate barcode')
  }
}

async function save(): Promise<void> {
  if (busy.value) return
  error.value = ''
  busy.value = true
  try {
    const input: ItemInput = {
      sku: form.sku,
      name: form.name,
      description: form.description,
      category_id: form.category_id,
      unit: form.unit,
      cost_price: pesosToCentavos(form.cost),
      sell_price: pesosToCentavos(form.sell),
      // v-model on number inputs casts typed values to number — stringify first.
      wholesale_price: String(form.wholesale).trim() === '' ? null : pesosToCentavos(form.wholesale),
      reorder_level: Number(form.reorder_level) || 0,
      tax_type: form.tax_type,
      active: form.active ? 1 : 0,
      // Plain copy — a reactive Proxy array cannot cross the contextBridge.
      barcodes: [...form.barcodes]
    }
    if (props.itemId === null) {
      await window.api.items.create(input)
      toast.success('Item created')
    } else {
      await window.api.items.update(props.itemId, input)
      toast.success('Item saved')
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
    :title="itemId === null ? 'New Item' : 'Edit Item'"
    width="max-w-2xl"
    @close="emit('close')"
  >
    <form id="item-form" class="grid grid-cols-2 gap-4" @submit.prevent="save">
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">SKU *</label>
        <input v-model="form.sku" type="text" required class="input" />
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Name *</label>
        <input v-model="form.name" type="text" required class="input" />
      </div>

      <div class="col-span-2">
        <label class="mb-1 block text-sm font-medium text-gray-700">Description</label>
        <input v-model="form.description" type="text" class="input" />
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Category</label>
        <select v-model="form.category_id" class="input">
          <option :value="null">— None —</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Unit</label>
        <select v-model="form.unit" class="input">
          <option v-for="u in UNITS" :key="u" :value="u">{{ u }}</option>
        </select>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Cost price (₱)</label>
        <input v-model="form.cost" type="number" min="0" step="0.01" class="input" />
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Selling price (₱)</label>
        <input v-model="form.sell" type="number" min="0" step="0.01" class="input" />
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Wholesale price (₱)</label>
        <input
          v-model="form.wholesale"
          type="number"
          min="0"
          step="0.01"
          placeholder="Optional"
          class="input"
        />
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Reorder level</label>
        <input v-model.number="form.reorder_level" type="number" min="0" step="1" class="input" />
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Tax type</label>
        <select v-model="form.tax_type" class="input">
          <option value="vat">VAT</option>
          <option value="non_vat">Non-VAT</option>
        </select>
      </div>
      <div class="flex items-end pb-2">
        <label class="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input v-model="form.active" type="checkbox" class="h-4 w-4 rounded accent-accent" />
          Active
        </label>
      </div>

      <!-- Barcodes -->
      <div class="col-span-2 rounded-lg border border-gray-200 p-3">
        <p class="mb-2 text-sm font-medium text-gray-700">Barcodes</p>
        <div class="mb-2 flex gap-2">
          <input
            v-model="barcodeInput"
            type="text"
            placeholder="Scan or type a barcode, then Enter"
            class="input flex-1"
            @keydown.enter.prevent="addBarcode"
          />
          <button type="button" class="btn-secondary" @click="addBarcode">Add</button>
          <button type="button" class="btn-secondary" @click="generateBarcode">Generate</button>
        </div>
        <TransitionGroup name="rows" tag="ul" class="space-y-1">
          <li
            v-for="code in form.barcodes"
            :key="code"
            class="flex items-center justify-between rounded bg-gray-50 px-3 py-1.5 font-mono text-sm"
          >
            {{ code }}
            <button
              type="button"
              class="text-gray-400 transition-colors duration-100 hover:text-red-600"
              :aria-label="`Remove ${code}`"
              @click="removeBarcode(code)"
            >
              <AppIcon name="x-circle" class="h-4 w-4" />
            </button>
          </li>
        </TransitionGroup>
        <p v-if="form.barcodes.length === 0" class="text-sm text-gray-400">
          No barcodes yet — scan one or generate an internal code.
        </p>
      </div>

      <p v-if="error" class="col-span-2 text-sm text-red-600" role="alert">{{ error }}</p>
    </form>

    <template #footer>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn-secondary" @click="emit('close')">Cancel</button>
        <button type="submit" form="item-form" :disabled="busy" class="btn-primary">
          {{ busy ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </template>
  </AppModal>
</template>
