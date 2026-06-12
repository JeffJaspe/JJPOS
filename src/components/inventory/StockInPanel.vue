<script setup lang="ts">
import { onMounted, ref } from 'vue'
import ItemPicker from './ItemPicker.vue'
import { useToast } from '@/composables/useToast'
import { centavosToInput, formatPeso, pesosToCentavos } from '@/utils/money'
import type { ItemRow, Supplier } from '../../../shared/types'

const emit = defineEmits<{ changed: [] }>()
const toast = useToast()

interface ReceiveLine {
  item: ItemRow
  qty: number
  /**
   * New unit cost; empty = keep the current cost. Starts as a string but
   * v-model on a number input casts typed values to number — handle both.
   */
  newCost: string | number
}

const suppliers = ref<Supplier[]>([])
const supplierId = ref<number | null>(null)
const refNo = ref('')
const note = ref('')
const lines = ref<ReceiveLine[]>([])
const busy = ref(false)

onMounted(async () => {
  suppliers.value = await window.api.suppliers.list()
})

function addItem(item: ItemRow): void {
  const existing = lines.value.find((l) => l.item.id === item.id)
  if (existing) existing.qty += 1
  else lines.value.push({ item, qty: 1, newCost: '' })
}

async function commit(): Promise<void> {
  if (busy.value || lines.value.length === 0) return
  busy.value = true
  try {
    await window.api.inventory.stockIn({
      supplier_id: supplierId.value,
      ref_no: refNo.value,
      note: note.value,
      lines: lines.value.map((l) => ({
        item_id: l.item.id,
        qty: Math.trunc(l.qty) || 1,
        new_cost: String(l.newCost).trim() === '' ? null : pesosToCentavos(l.newCost)
      }))
    })
    toast.success(`Received ${lines.value.length} line(s) — ${refNo.value}`)
    lines.value = []
    refNo.value = ''
    note.value = ''
    emit('changed')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Stock-in failed')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="max-w-4xl space-y-4">
    <div class="grid grid-cols-3 gap-3">
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Supplier</label>
        <select v-model="supplierId" class="input">
          <option :value="null">— None —</option>
          <option v-for="s in suppliers" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Reference no. *</label>
        <input v-model="refNo" type="text" placeholder="DR / invoice no." class="input" />
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Note</label>
        <input v-model="note" type="text" class="input" />
      </div>
    </div>

    <ItemPicker placeholder="Scan or search items to receive…" @select="addItem" />

    <div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
          <tr>
            <th class="px-4 py-2.5">Item</th>
            <th class="w-28 px-4 py-2.5 text-right">On hand</th>
            <th class="w-28 px-4 py-2.5 text-center">Qty in</th>
            <th class="w-32 px-4 py-2.5 text-right">Current cost</th>
            <th class="w-36 px-4 py-2.5 text-right">New cost (₱)</th>
            <th class="w-10 px-4 py-2.5"></th>
          </tr>
        </thead>
        <TransitionGroup name="rows" tag="tbody" class="divide-y divide-gray-100">
          <tr v-for="(line, i) in lines" :key="line.item.id">
            <td class="px-4 py-2">
              <p class="font-medium text-gray-900">{{ line.item.name }}</p>
              <p class="font-mono text-xs text-gray-400">{{ line.item.sku }}</p>
            </td>
            <td class="px-4 py-2 text-right tabular-nums">{{ line.item.qty_on_hand }}</td>
            <td class="px-4 py-2 text-center">
              <input v-model.number="line.qty" type="number" min="1" step="1" class="input w-20 px-2 py-1 text-center" />
            </td>
            <td class="px-4 py-2 text-right tabular-nums text-gray-500">
              {{ formatPeso(line.item.cost_price) }}
            </td>
            <td class="px-4 py-2 text-right">
              <input
                v-model="line.newCost"
                type="number"
                min="0"
                step="0.01"
                :placeholder="centavosToInput(line.item.cost_price)"
                class="input w-28 px-2 py-1 text-right"
              />
            </td>
            <td class="px-4 py-2 text-center">
              <button
                class="text-gray-300 transition-colors duration-100 hover:text-red-600"
                :aria-label="`Remove ${line.item.name}`"
                @click="lines.splice(i, 1)"
              >
                ✕
              </button>
            </td>
          </tr>
        </TransitionGroup>
      </table>
      <p v-if="lines.length === 0" class="py-10 text-center text-sm text-gray-400">
        Scan items to receive them into stock.
      </p>
    </div>

    <div class="flex justify-end">
      <button class="btn-primary px-8" :disabled="busy || lines.length === 0" @click="commit">
        {{ busy ? 'Receiving…' : 'Receive Stock' }}
      </button>
    </div>
  </div>
</template>
