<script setup lang="ts">
import { ref, watch } from 'vue'
import AppModal from '@/components/ui/AppModal.vue'
import type { SpecialDiscount, SpecialDiscountType } from '../../../shared/types'

const props = defineProps<{ open: boolean; current: SpecialDiscount | null }>()
const emit = defineEmits<{ close: []; apply: [value: SpecialDiscount]; remove: [] }>()

const type = ref<SpecialDiscountType>('senior')
const name = ref('')
const idNo = ref('')
const error = ref('')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    error.value = ''
    type.value = props.current?.type ?? 'senior'
    name.value = props.current?.name ?? ''
    idNo.value = props.current?.id ?? ''
  }
)

function apply(): void {
  error.value = ''
  if (!idNo.value.trim()) {
    error.value = 'ID number is required'
    return
  }
  emit('apply', { type: type.value, name: name.value.trim(), id: idNo.value.trim() })
}
</script>

<template>
  <AppModal :open="open" title="Senior Citizen / PWD Discount" width="max-w-md" @close="emit('close')">
    <form id="senior-pwd-form" class="space-y-4" @submit.prevent="apply">
      <div>
        <p class="mb-1 block text-sm font-medium text-gray-700">Discount type</p>
        <div class="flex gap-2">
          <button
            v-for="opt in (['senior', 'pwd'] as const)"
            :key="opt"
            type="button"
            class="flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors duration-100"
            :class="
              type === opt
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-gray-200 text-gray-600 hover:border-gray-300'
            "
            @click="type = opt"
          >
            {{ opt === 'senior' ? 'Senior Citizen' : 'PWD' }}
          </button>
        </div>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Cardholder name</label>
        <input v-model="name" type="text" class="input" placeholder="Name on the ID" />
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">
          {{ type === 'senior' ? 'OSCA / Senior ID no.' : 'PWD ID no.' }} *
        </label>
        <input v-model="idNo" type="text" class="input" placeholder="ID number" />
      </div>

      <p class="rounded-md bg-gray-50 p-2 text-xs text-gray-500">
        Applies a 20% discount to the transaction and records the presented ID. VAT is computed
        normally.
      </p>

      <p v-if="error" class="text-sm text-red-600" role="alert">{{ error }}</p>
    </form>

    <template #footer>
      <div class="flex justify-between gap-2">
        <button
          v-if="current"
          type="button"
          class="text-sm font-medium text-red-600 hover:opacity-80"
          @click="emit('remove')"
        >
          Remove discount
        </button>
        <div class="ml-auto flex gap-2">
          <button type="button" class="btn-secondary" @click="emit('close')">Cancel</button>
          <button type="submit" form="senior-pwd-form" class="btn-primary">Apply</button>
        </div>
      </div>
    </template>
  </AppModal>
</template>
