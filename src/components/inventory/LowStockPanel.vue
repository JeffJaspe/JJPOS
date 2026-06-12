<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { LowStockRow } from '../../../shared/types'

const rows = ref<LowStockRow[]>([])

async function load(): Promise<void> {
  rows.value = await window.api.inventory.lowStock()
}
onMounted(load)

defineExpose({ load })
</script>

<template>
  <div class="max-w-3xl space-y-3">
    <p class="text-sm text-gray-500">
      Items at or below their reorder level. Set reorder levels on the item form.
    </p>
    <div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
          <tr>
            <th class="px-4 py-2.5">SKU</th>
            <th class="px-4 py-2.5">Item</th>
            <th class="px-4 py-2.5 text-right">On hand</th>
            <th class="px-4 py-2.5 text-right">Reorder level</th>
            <th class="px-4 py-2.5 text-right">To order</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="r in rows" :key="r.id">
            <td class="px-4 py-2 font-mono text-xs">{{ r.sku }}</td>
            <td class="px-4 py-2 font-medium text-gray-900">{{ r.name }}</td>
            <td class="px-4 py-2 text-right font-semibold tabular-nums text-red-600">
              {{ r.qty_on_hand }}
            </td>
            <td class="px-4 py-2 text-right tabular-nums text-gray-500">{{ r.reorder_level }}</td>
            <td class="px-4 py-2 text-right tabular-nums">
              {{ Math.max(r.reorder_level * 2 - r.qty_on_hand, 0) }} {{ r.unit }}
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="rows.length === 0" class="py-10 text-center text-sm text-gray-400">
        Nothing is below its reorder level. 🎉
      </p>
    </div>
  </div>
</template>
