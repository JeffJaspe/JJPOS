<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import ItemPicker from './ItemPicker.vue'
import { formatDateTime } from '@/utils/datetime'
import type { ItemRow, MovementRow } from '../../../shared/types'

const movements = ref<MovementRow[]>([])
const typeFilter = ref('all')
const itemFilter = ref<ItemRow | null>(null)

const TYPES = ['all', 'sale', 'return', 'stock_in', 'adjustment', 'count']

const TYPE_STYLE: Record<string, string> = {
  sale: 'bg-blue-100 text-blue-700',
  return: 'bg-purple-100 text-purple-700',
  stock_in: 'bg-green-100 text-green-700',
  adjustment: 'bg-amber-100 text-amber-700',
  count: 'bg-gray-200 text-gray-700'
}

async function load(): Promise<void> {
  movements.value = await window.api.inventory.movements({
    itemId: itemFilter.value?.id ?? null,
    type: typeFilter.value === 'all' ? undefined : typeFilter.value,
    limit: 200
  })
}

onMounted(load)
watch([typeFilter, itemFilter], load)

defineExpose({ load })
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center gap-3">
      <select v-model="typeFilter" class="input max-w-40">
        <option v-for="t in TYPES" :key="t" :value="t">
          {{ t === 'all' ? 'All types' : t.replace('_', ' ') }}
        </option>
      </select>
      <div class="w-72">
        <ItemPicker placeholder="Filter by item…" @select="(i) => (itemFilter = i)" />
      </div>
      <span
        v-if="itemFilter"
        class="flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-0.5 text-xs text-accent"
      >
        {{ itemFilter.name }}
        <button class="hover:text-red-600" @click="itemFilter = null">✕</button>
      </span>
    </div>

    <div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
          <tr>
            <th class="px-4 py-2.5">Date</th>
            <th class="px-4 py-2.5">Item</th>
            <th class="px-4 py-2.5 text-center">Type</th>
            <th class="px-4 py-2.5 text-right">Qty</th>
            <th class="px-4 py-2.5">Note</th>
            <th class="px-4 py-2.5">By</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="m in movements" :key="m.id">
            <td class="px-4 py-2 whitespace-nowrap text-gray-500">{{ formatDateTime(m.datetime) }}</td>
            <td class="px-4 py-2">
              <span class="font-medium text-gray-900">{{ m.item_name }}</span>
              <span class="ml-1 font-mono text-xs text-gray-400">{{ m.sku }}</span>
            </td>
            <td class="px-4 py-2 text-center">
              <span class="rounded-full px-2 py-0.5 text-xs" :class="TYPE_STYLE[m.type]">
                {{ m.type.replace('_', ' ') }}
              </span>
            </td>
            <td
              class="px-4 py-2 text-right font-semibold tabular-nums"
              :class="m.qty_change > 0 ? 'text-green-600' : 'text-red-600'"
            >
              {{ m.qty_change > 0 ? '+' : '' }}{{ m.qty_change }}
            </td>
            <td class="max-w-64 truncate px-4 py-2 text-gray-500" :title="m.note">{{ m.note || '—' }}</td>
            <td class="px-4 py-2 text-gray-500">{{ m.user }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="movements.length === 0" class="py-10 text-center text-sm text-gray-400">
        No movements match the filter.
      </p>
    </div>
  </div>
</template>
