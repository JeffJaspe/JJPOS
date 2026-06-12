<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppModal from '@/components/ui/AppModal.vue'
import BarcodeSvg from '@/components/ui/BarcodeSvg.vue'
import { useToast } from '@/composables/useToast'
import { formatPeso } from '@/utils/money'
import type { ItemDetail, ItemRow } from '../../../shared/types'

const props = defineProps<{
  open: boolean
  item: ItemRow | null
}>()

const emit = defineEmits<{ close: [] }>()

const toast = useToast()

const detail = ref<ItemDetail | null>(null)
const selectedBarcode = ref('')
const copies = ref(1)

watch(
  () => props.open,
  async (open) => {
    if (!open || !props.item) return
    copies.value = 1
    detail.value = await window.api.items.get(props.item.id)
    selectedBarcode.value = detail.value.barcodes[0] ?? ''
  }
)

const labels = computed(() => {
  if (!detail.value || !selectedBarcode.value) return []
  return Array.from({ length: Math.min(Math.max(copies.value, 1), 200) }, (_, i) => i)
})

function print(): void {
  if (!selectedBarcode.value) {
    toast.error('This item has no barcode — add or generate one first')
    return
  }
  window.print()
}
</script>

<template>
  <AppModal :open="open" title="Print Labels" @close="emit('close')">
    <div v-if="detail" class="space-y-4">
      <p class="text-sm text-gray-700">
        <span class="font-medium">{{ detail.name }}</span>
        — {{ formatPeso(detail.sell_price) }}
      </p>

      <div v-if="detail.barcodes.length === 0" class="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
        This item has no barcode yet. Add or generate one from the item form first.
      </div>

      <template v-else>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="mb-1 block text-sm font-medium text-gray-700">Barcode</label>
            <select v-model="selectedBarcode" class="input">
              <option v-for="code in detail.barcodes" :key="code" :value="code">{{ code }}</option>
            </select>
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-gray-700">Copies</label>
            <input v-model.number="copies" type="number" min="1" max="200" class="input" />
          </div>
        </div>

        <!-- On-screen preview of a single label -->
        <div class="flex justify-center rounded-lg border border-dashed border-gray-300 p-4">
          <div class="flex flex-col items-center">
            <p class="max-w-48 truncate text-xs font-medium">{{ detail.name }}</p>
            <BarcodeSvg :code="selectedBarcode" />
            <p class="text-xs font-semibold">{{ formatPeso(detail.sell_price) }}</p>
          </div>
        </div>
      </template>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn-secondary" @click="emit('close')">Close</button>
        <button
          type="button"
          class="btn-primary"
          :disabled="!selectedBarcode"
          @click="print"
        >
          Print {{ labels.length }} label{{ labels.length === 1 ? '' : 's' }}
        </button>
      </div>
    </template>
  </AppModal>

  <!-- Hidden on screen; the only visible element when printing (see main.css). -->
  <Teleport to="body">
    <div v-if="open && detail && selectedBarcode" class="print-area">
      <div
        v-for="i in labels"
        :key="i"
        style="
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          width: 50mm;
          height: 30mm;
          overflow: hidden;
          padding: 1mm;
          page-break-inside: avoid;
        "
      >
        <p style="margin: 0; max-width: 48mm; font-size: 9pt; white-space: nowrap; overflow: hidden">
          {{ detail.name }}
        </p>
        <BarcodeSvg :code="selectedBarcode" :height="35" />
        <p style="margin: 0; font-size: 10pt; font-weight: 600">
          {{ formatPeso(detail.sell_price) }}
        </p>
      </div>
    </div>
  </Teleport>
</template>
