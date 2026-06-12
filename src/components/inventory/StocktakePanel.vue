<script setup lang="ts">
import { ref } from 'vue'
import ItemPicker from './ItemPicker.vue'
import { useToast } from '@/composables/useToast'
import type { ItemRow } from '../../../shared/types'

const emit = defineEmits<{ changed: [] }>()
const toast = useToast()

interface CountLine {
  item: ItemRow
  counted: number
}

const lines = ref<CountLine[]>([])
const note = ref('')
const busy = ref(false)

/** Scanning the same item again counts one more unit — like a physical pass. */
function addItem(item: ItemRow): void {
  const existing = lines.value.find((l) => l.item.id === item.id)
  if (existing) existing.counted += 1
  else lines.value.push({ item, counted: 1 })
}

function variance(line: CountLine): number {
  return Math.trunc(line.counted) - line.item.qty_on_hand
}

async function commit(): Promise<void> {
  if (busy.value || lines.value.length === 0) return
  busy.value = true
  try {
    const result = await window.api.inventory.stocktake({
      note: note.value,
      lines: lines.value.map((l) => ({
        item_id: l.item.id,
        counted_qty: Math.trunc(l.counted)
      }))
    })
    toast.success(`Stocktake done: ${result.adjusted} adjusted, ${result.unchanged} matched`)
    lines.value = []
    note.value = ''
    emit('changed')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Stocktake failed')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="max-w-4xl space-y-4">
    <div class="flex items-end gap-3">
      <div class="flex-1">
        <ItemPicker placeholder="Scan each unit — repeated scans add to the count…" @select="addItem" />
      </div>
      <div class="w-64">
        <input v-model="note" type="text" placeholder="Stocktake note (optional)" class="input" />
      </div>
    </div>

    <div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
          <tr>
            <th class="px-4 py-2.5">Item</th>
            <th class="w-28 px-4 py-2.5 text-right">System</th>
            <th class="w-32 px-4 py-2.5 text-center">Counted</th>
            <th class="w-28 px-4 py-2.5 text-right">Variance</th>
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
              <input v-model.number="line.counted" type="number" min="0" step="1" class="input w-24 px-2 py-1 text-center" />
            </td>
            <td
              class="px-4 py-2 text-right font-semibold tabular-nums"
              :class="variance(line) === 0 ? 'text-gray-400' : variance(line) > 0 ? 'text-green-600' : 'text-red-600'"
            >
              {{ variance(line) > 0 ? '+' : '' }}{{ variance(line) }}
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
        Scan items as you count the shelves; commit when done.
      </p>
    </div>

    <div class="flex justify-end">
      <button class="btn-primary px-8" :disabled="busy || lines.length === 0" @click="commit">
        {{ busy ? 'Committing…' : 'Commit Stocktake' }}
      </button>
    </div>
  </div>
</template>
