<script setup lang="ts">
import { ref } from 'vue'
import ItemPicker from './ItemPicker.vue'
import { useToast } from '@/composables/useToast'
import type { AdjustReason, ItemRow } from '../../../shared/types'

const emit = defineEmits<{ changed: [] }>()
const toast = useToast()

const REASONS: { value: AdjustReason; label: string }[] = [
  { value: 'damage', label: 'Damage' },
  { value: 'loss', label: 'Loss / theft' },
  { value: 'expired', label: 'Expired' },
  { value: 'count_correction', label: 'Count correction' },
  { value: 'other', label: 'Other' }
]

const item = ref<ItemRow | null>(null)
const qtyChange = ref(0)
const reason = ref<AdjustReason>('damage')
const note = ref('')
const busy = ref(false)

async function pickItem(picked: ItemRow): Promise<void> {
  item.value = picked
  qtyChange.value = 0
}

async function submit(): Promise<void> {
  if (busy.value || !item.value) return
  busy.value = true
  try {
    await window.api.inventory.adjust({
      item_id: item.value.id,
      qty_change: Math.trunc(qtyChange.value),
      reason: reason.value,
      note: note.value
    })
    toast.success(`${item.value.name}: ${qtyChange.value > 0 ? '+' : ''}${qtyChange.value} recorded`)
    // Refresh the item display
    item.value = await window.api.items.get(item.value.id)
    qtyChange.value = 0
    note.value = ''
    emit('changed')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Adjustment failed')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="max-w-xl space-y-4">
    <ItemPicker placeholder="Scan or search the item to adjust…" @select="pickItem" />

    <div v-if="item" class="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="font-medium text-gray-900">{{ item.name }}</p>
          <p class="font-mono text-xs text-gray-400">{{ item.sku }}</p>
        </div>
        <div class="text-right">
          <p class="text-xs tracking-wide text-gray-500 uppercase">On hand</p>
          <p class="text-2xl font-bold tabular-nums">{{ item.qty_on_hand }}</p>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">
            Quantity change (− removes)
          </label>
          <input v-model.number="qtyChange" type="number" step="1" class="input" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Reason</label>
          <select v-model="reason" class="input">
            <option v-for="r in REASONS" :key="r.value" :value="r.value">{{ r.label }}</option>
          </select>
        </div>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Note</label>
        <input v-model="note" type="text" class="input" placeholder="Optional detail" />
      </div>

      <p v-if="qtyChange !== 0" class="text-sm text-gray-600">
        New on-hand will be
        <span class="font-semibold">{{ item.qty_on_hand + Math.trunc(qtyChange) }}</span>
      </p>

      <div class="flex justify-end">
        <button class="btn-primary" :disabled="busy || qtyChange === 0" @click="submit">
          {{ busy ? 'Saving…' : 'Record Adjustment' }}
        </button>
      </div>
    </div>
    <p v-else class="rounded-lg border border-dashed border-gray-300 bg-white py-10 text-center text-sm text-gray-400">
      Pick an item to adjust its stock.
    </p>
  </div>
</template>
