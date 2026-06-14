<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import AppModal from '@/components/ui/AppModal.vue'
import { formatPeso } from '@/utils/money'
import type { PosItem } from '../../../shared/types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; select: [item: PosItem] }>()

const term = ref('')
const results = ref<PosItem[]>([])
const searchBox = ref<HTMLInputElement | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    term.value = ''
    results.value = []
    await nextTick()
    searchBox.value?.focus()
  }
)

function onInput(): void {
  clearTimeout(timer)
  const q = term.value.trim()
  if (q.length < 1) {
    results.value = []
    return
  }
  timer = setTimeout(async () => {
    results.value = await window.api.pos.search(q)
  }, 200)
}

/** Enter with a single match adds it immediately (keyboard-first). */
function onEnter(): void {
  if (results.value.length >= 1) add(results.value[0])
}

function add(item: PosItem): void {
  emit('select', item)
  // Keep the modal open for adding several; reset and refocus.
  term.value = ''
  results.value = []
  searchBox.value?.focus()
}
</script>

<template>
  <AppModal :open="open" title="Find Item (F1)" width="max-w-xl" @close="emit('close')">
    <div class="space-y-3">
      <input
        ref="searchBox"
        v-model="term"
        type="text"
        placeholder="Type a name or SKU…"
        class="input py-2.5 text-base"
        @input="onInput"
        @keydown.enter.prevent="onEnter"
        @keydown.esc="emit('close')"
      />
      <div class="max-h-80 overflow-y-auto rounded-lg border border-gray-200">
        <button
          v-for="r in results"
          :key="r.itemId"
          type="button"
          class="flex w-full items-center justify-between border-b border-gray-100 px-4 py-2.5 text-left text-sm transition-colors duration-100 last:border-0 hover:bg-gray-50"
          @click="add(r)"
        >
          <span>
            <span class="font-medium text-gray-900">{{ r.name }}</span>
            <span class="ml-2 font-mono text-xs text-gray-400">{{ r.sku }}</span>
            <span
              v-if="r.promoName"
              class="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700"
            >
              {{ r.promoName }}
            </span>
            <span class="ml-2 text-xs text-gray-400">on hand: {{ r.qtyOnHand }}</span>
          </span>
          <span class="tabular-nums">
            <span v-if="r.promoId" class="mr-1 text-xs text-gray-400 line-through">
              {{ formatPeso(r.sellPrice) }}
            </span>
            <span class="font-semibold">{{ formatPeso(r.effectivePrice) }}</span>
          </span>
        </button>
        <p v-if="term && results.length === 0" class="py-6 text-center text-sm text-gray-400">
          No items match “{{ term }}”.
        </p>
        <p v-else-if="!term" class="py-6 text-center text-sm text-gray-400">
          Start typing to search. Enter adds the top match.
        </p>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end">
        <button type="button" class="btn-secondary" @click="emit('close')">Done (Esc)</button>
      </div>
    </template>
  </AppModal>
</template>
