<script setup lang="ts">
import { ref, watch } from 'vue'
import AppModal from '@/components/ui/AppModal.vue'
import { useToast } from '@/composables/useToast'
import { formatDateTime } from '@/utils/datetime'
import type { HeldSale } from '../../../shared/types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; recalled: [payload: string] }>()

const toast = useToast()
const held = ref<HeldSale[]>([])

watch(
  () => props.open,
  async (open) => {
    if (open) held.value = await window.api.sales.held()
  }
)

async function recall(id: number): Promise<void> {
  try {
    const payload = await window.api.sales.recall(id)
    emit('recalled', payload)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Recall failed')
    held.value = await window.api.sales.held()
  }
}

async function remove(id: number): Promise<void> {
  await window.api.sales.deleteHeld(id)
  held.value = await window.api.sales.held()
}
</script>

<template>
  <AppModal :open="open" title="Held Transactions" @close="emit('close')">
    <TransitionGroup name="rows" tag="ul" class="divide-y divide-gray-100">
      <li v-for="h in held" :key="h.id" class="flex items-center gap-3 py-2.5">
        <div class="flex-1">
          <p class="text-sm font-medium text-gray-900">{{ h.label || 'Held sale #' + h.id }}</p>
          <p class="text-xs text-gray-500">{{ formatDateTime(h.created_at) }} · {{ h.cashier }}</p>
        </div>
        <button class="btn-primary px-3 py-1.5 text-xs" @click="recall(h.id)">Recall</button>
        <button class="btn-secondary px-3 py-1.5 text-xs" @click="remove(h.id)">Delete</button>
      </li>
    </TransitionGroup>
    <p v-if="held.length === 0" class="py-8 text-center text-sm text-gray-400">
      No held transactions.
    </p>
  </AppModal>
</template>
