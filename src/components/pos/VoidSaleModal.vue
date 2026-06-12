<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppModal from '@/components/ui/AppModal.vue'
import { useToast } from '@/composables/useToast'
import { usePermissions } from '@/composables/usePermissions'
import { formatPeso } from '@/utils/money'
import { formatDateTime } from '@/utils/datetime'
import type { RecentSale } from '../../../shared/types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; voided: [] }>()

const toast = useToast()
const { can } = usePermissions()

const sales = ref<RecentSale[]>([])
const selectedId = ref<number | null>(null)
const reason = ref('')
const supUsername = ref('')
const supPassword = ref('')
const busy = ref(false)

const needsApproval = computed(() => !can('void'))

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    selectedId.value = null
    reason.value = ''
    supUsername.value = ''
    supPassword.value = ''
    sales.value = (await window.api.sales.recent(30)).filter((s) => s.status === 'completed')
  }
)

const canConfirm = computed(
  () =>
    selectedId.value !== null &&
    reason.value.trim().length > 0 &&
    (!needsApproval.value || (supUsername.value.trim() && supPassword.value)) &&
    !busy.value
)

async function confirm(): Promise<void> {
  if (!canConfirm.value || selectedId.value === null) return
  busy.value = true
  try {
    const receipt = await window.api.sales.void({
      sale_id: selectedId.value,
      reason: reason.value.trim(),
      supervisor: needsApproval.value
        ? { username: supUsername.value.trim(), password: supPassword.value }
        : null
    })
    toast.success(`${receipt.sale_no} voided — stock returned`)
    emit('voided')
    emit('close')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Void failed')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AppModal :open="open" title="Void a Sale" width="max-w-2xl" @close="emit('close')">
    <div class="space-y-4">
      <div class="max-h-64 overflow-y-auto rounded-lg border border-gray-200">
        <table class="w-full text-sm">
          <tbody class="divide-y divide-gray-100">
            <tr
              v-for="s in sales"
              :key="s.id"
              class="cursor-pointer transition-colors duration-100"
              :class="selectedId === s.id ? 'bg-accent/10' : 'hover:bg-gray-50'"
              @click="selectedId = s.id"
            >
              <td class="px-3 py-2">
                <input type="radio" :checked="selectedId === s.id" class="accent-accent" />
              </td>
              <td class="px-3 py-2 font-mono text-xs">{{ s.sale_no }}</td>
              <td class="px-3 py-2 text-gray-500">{{ formatDateTime(s.datetime) }}</td>
              <td class="px-3 py-2 text-gray-500">{{ s.customer_name ?? '—' }}</td>
              <td class="px-3 py-2 text-right font-medium tabular-nums">
                {{ formatPeso(s.total) }}
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="sales.length === 0" class="py-6 text-center text-sm text-gray-400">
          No recent completed sales.
        </p>
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Reason *</label>
        <input
          v-model="reason"
          type="text"
          placeholder="e.g. wrong item, customer changed mind"
          class="input"
        />
      </div>

      <div v-if="needsApproval" class="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <p class="mb-2 text-sm font-medium text-amber-800">
          Supervisor approval required — enter supervisor credentials:
        </p>
        <div class="grid grid-cols-2 gap-2">
          <input
            v-model="supUsername"
            type="text"
            placeholder="Supervisor username"
            autocomplete="off"
            class="input"
          />
          <input
            v-model="supPassword"
            type="password"
            placeholder="Password"
            autocomplete="off"
            class="input"
          />
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn-secondary" @click="emit('close')">Cancel</button>
        <button
          type="button"
          class="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-transform duration-100 hover:bg-red-700 active:scale-[0.98] disabled:opacity-50"
          :disabled="!canConfirm"
          @click="confirm"
        >
          {{ busy ? 'Voiding…' : 'Void Sale' }}
        </button>
      </div>
    </template>
  </AppModal>
</template>
