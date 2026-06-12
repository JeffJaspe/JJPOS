<script setup lang="ts">
import { ref } from 'vue'
import type { ItemRow } from '../../../shared/types'

const props = defineProps<{ placeholder?: string }>()
const emit = defineEmits<{ select: [item: ItemRow] }>()

const term = ref('')
const results = ref<ItemRow[]>([])
let timer: ReturnType<typeof setTimeout> | undefined

function onInput(): void {
  clearTimeout(timer)
  const q = term.value.trim()
  if (q.length < 2) {
    results.value = []
    return
  }
  timer = setTimeout(async () => {
    results.value = await window.api.items.list({ search: q })
  }, 250)
}

/** Enter = scanner finished typing a barcode (items search matches it exactly). */
async function onEnter(): Promise<void> {
  const q = term.value.trim()
  if (!q) return
  const matches = await window.api.items.list({ search: q })
  if (matches.length >= 1) pick(matches[0])
}

function pick(item: ItemRow): void {
  emit('select', item)
  term.value = ''
  results.value = []
}
</script>

<template>
  <div class="relative">
    <input
      v-model="term"
      type="text"
      :placeholder="props.placeholder ?? 'Scan barcode or search item…'"
      class="input"
      @input="onInput"
      @keydown.enter.prevent="onEnter"
      @keydown.esc="((term = ''), (results = []))"
    />
    <div
      v-if="results.length"
      class="absolute top-full right-0 left-0 z-10 mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
    >
      <button
        v-for="r in results"
        :key="r.id"
        type="button"
        class="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors duration-100 hover:bg-gray-50"
        @click="pick(r)"
      >
        <span>
          <span class="font-medium text-gray-900">{{ r.name }}</span>
          <span class="ml-2 font-mono text-xs text-gray-400">{{ r.sku }}</span>
        </span>
        <span class="text-xs text-gray-500">on hand: {{ r.qty_on_hand }}</span>
      </button>
    </div>
  </div>
</template>
