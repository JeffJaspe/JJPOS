<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import AppModal from '@/components/ui/AppModal.vue'
import { useToast } from '@/composables/useToast'
import { usePermissions } from '@/composables/usePermissions'
import { centavosToInput, formatPeso, pesosToCentavos } from '@/utils/money'
import { formatDateTime, localInputToUtc, utcToLocalInput } from '@/utils/datetime'
import type { ItemRow, Promo, PromoInput, PromoType } from '../../../shared/types'

const toast = useToast()
const { can } = usePermissions()
const canEdit = can('edit_items')

const promos = ref<Promo[]>([])
const formOpen = ref(false)
const editingId = ref<number | null>(null)
const error = ref('')
const busy = ref(false)

interface FormState {
  name: string
  type: PromoType
  value: string
  startsAt: string
  endsAt: string
  active: boolean
}

const form = reactive<FormState>(blank())
const selectedItems = ref<Map<number, string>>(new Map())
const itemSearch = ref('')
const itemResults = ref<ItemRow[]>([])
let itemTimer: ReturnType<typeof setTimeout> | undefined

function blank(): FormState {
  return { name: '', type: 'percent', value: '', startsAt: '', endsAt: '', active: true }
}

async function load(): Promise<void> {
  promos.value = await window.api.promos.list()
}
onMounted(load)

watch(itemSearch, () => {
  clearTimeout(itemTimer)
  const q = itemSearch.value.trim()
  if (q.length < 2) {
    itemResults.value = []
    return
  }
  itemTimer = setTimeout(async () => {
    itemResults.value = await window.api.items.list({ search: q })
  }, 250)
})

function openNew(): void {
  editingId.value = null
  Object.assign(form, blank())
  selectedItems.value = new Map()
  itemSearch.value = ''
  error.value = ''
  formOpen.value = true
}

async function openEdit(promo: Promo): Promise<void> {
  const detail = await window.api.promos.get(promo.id)
  editingId.value = promo.id
  Object.assign(form, {
    name: detail.name,
    type: detail.type,
    value: detail.type === 'percent' ? String(detail.value) : centavosToInput(detail.value),
    startsAt: utcToLocalInput(detail.starts_at),
    endsAt: utcToLocalInput(detail.ends_at),
    active: detail.active === 1
  })
  // Resolve names for the chips
  selectedItems.value = new Map()
  const all = await window.api.items.list({ includeInactive: true })
  for (const id of detail.itemIds) {
    const item = all.find((i) => i.id === id)
    selectedItems.value.set(id, item?.name ?? `#${id}`)
  }
  itemSearch.value = ''
  error.value = ''
  formOpen.value = true
}

function toggleItem(item: ItemRow): void {
  if (selectedItems.value.has(item.id)) selectedItems.value.delete(item.id)
  else selectedItems.value.set(item.id, item.name)
}

const valueLabel = computed(() =>
  form.type === 'percent' ? 'Percent off (%)' : form.type === 'amount' ? 'Amount off (₱)' : 'Promo price (₱)'
)

async function save(): Promise<void> {
  if (busy.value) return
  error.value = ''
  busy.value = true
  try {
    const input: PromoInput = {
      name: form.name,
      type: form.type,
      value:
        form.type === 'percent'
          ? Math.trunc(Number(form.value) || 0)
          : pesosToCentavos(form.value),
      starts_at: localInputToUtc(form.startsAt),
      ends_at: localInputToUtc(form.endsAt),
      active: form.active ? 1 : 0,
      itemIds: [...selectedItems.value.keys()]
    }
    if (editingId.value === null) {
      await window.api.promos.create(input)
      toast.success('Promo created')
    } else {
      await window.api.promos.update(editingId.value, input)
      toast.success('Promo saved')
    }
    formOpen.value = false
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Save failed'
  } finally {
    busy.value = false
  }
}

async function toggleActive(promo: Promo): Promise<void> {
  try {
    await window.api.promos.setActive(promo.id, promo.active ? 0 : 1)
    await load()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Update failed')
  }
}

function describeValue(promo: Promo): string {
  if (promo.type === 'percent') return `${promo.value}% off`
  if (promo.type === 'amount') return `${formatPeso(promo.value)} off`
  return `at ${formatPeso(promo.value)}`
}

function describeSchedule(promo: Promo): string {
  if (!promo.starts_at && !promo.ends_at) return 'Always'
  const from = promo.starts_at ? formatDateTime(promo.starts_at) : '…'
  const to = promo.ends_at ? formatDateTime(promo.ends_at) : '…'
  return `${from} → ${to}`
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <p class="text-sm text-gray-500">
        Scheduled item discounts — POS applies the best active promo automatically.
      </p>
      <button v-if="canEdit" class="btn-primary" @click="openNew">New Promo</button>
    </div>

    <div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
          <tr>
            <th class="px-4 py-3">Name</th>
            <th class="px-4 py-3">Discount</th>
            <th class="px-4 py-3">Schedule</th>
            <th class="px-4 py-3 text-center">Items</th>
            <th class="px-4 py-3 text-center">Status</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <TransitionGroup name="rows" tag="tbody" class="divide-y divide-gray-100">
          <tr v-for="p in promos" :key="p.id" :class="{ 'opacity-50': !p.active }">
            <td class="px-4 py-2.5 font-medium text-gray-900">{{ p.name }}</td>
            <td class="px-4 py-2.5 text-gray-600">{{ describeValue(p) }}</td>
            <td class="px-4 py-2.5 text-gray-500">{{ describeSchedule(p) }}</td>
            <td class="px-4 py-2.5 text-center text-gray-500">{{ p.item_count }}</td>
            <td class="px-4 py-2.5 text-center">
              <span
                class="rounded-full px-2 py-0.5 text-xs"
                :class="p.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'"
              >
                {{ p.active ? 'Active' : 'Inactive' }}
              </span>
            </td>
            <td class="px-4 py-2.5 text-right whitespace-nowrap">
              <template v-if="canEdit">
                <button
                  class="mr-3 text-sm font-medium text-accent transition-colors duration-100 hover:opacity-80"
                  @click="openEdit(p)"
                >
                  Edit
                </button>
                <button
                  class="text-sm font-medium transition-colors duration-100"
                  :class="p.active ? 'text-gray-500 hover:text-red-600' : 'text-green-600 hover:opacity-80'"
                  @click="toggleActive(p)"
                >
                  {{ p.active ? 'Deactivate' : 'Activate' }}
                </button>
              </template>
            </td>
          </tr>
        </TransitionGroup>
      </table>
      <p v-if="promos.length === 0" class="py-10 text-center text-sm text-gray-400">
        No promos yet.
      </p>
    </div>

    <!-- Form modal -->
    <AppModal
      :open="formOpen"
      :title="editingId === null ? 'New Promo' : 'Edit Promo'"
      width="max-w-2xl"
      @close="formOpen = false"
    >
      <form id="promo-form" class="grid grid-cols-2 gap-4" @submit.prevent="save">
        <div class="col-span-2">
          <label class="mb-1 block text-sm font-medium text-gray-700">Name *</label>
          <input v-model="form.name" type="text" required class="input" placeholder="e.g. Summer Sale" />
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Type</label>
          <select v-model="form.type" class="input">
            <option value="percent">Percent off</option>
            <option value="amount">Amount off</option>
            <option value="fixed_price">Fixed promo price</option>
          </select>
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">{{ valueLabel }}</label>
          <input v-model="form.value" type="number" min="0" step="0.01" required class="input" />
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Starts (optional)</label>
          <input v-model="form.startsAt" type="datetime-local" class="input" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Ends (optional)</label>
          <input v-model="form.endsAt" type="datetime-local" class="input" />
        </div>

        <div class="col-span-2">
          <label class="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input v-model="form.active" type="checkbox" class="h-4 w-4 rounded accent-accent" />
            Active
          </label>
        </div>

        <!-- Item picker -->
        <div class="col-span-2 rounded-lg border border-gray-200 p-3">
          <p class="mb-2 text-sm font-medium text-gray-700">
            Items on this promo ({{ selectedItems.size }})
          </p>
          <div v-if="selectedItems.size" class="mb-2 flex flex-wrap gap-1.5">
            <span
              v-for="[id, name] in selectedItems"
              :key="id"
              class="flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-0.5 text-xs text-accent"
            >
              {{ name }}
              <button type="button" class="hover:text-red-600" @click="selectedItems.delete(id)">✕</button>
            </span>
          </div>
          <input
            v-model="itemSearch"
            type="text"
            placeholder="Search items to add…"
            class="input mb-2"
          />
          <div v-if="itemResults.length" class="max-h-40 overflow-y-auto rounded border border-gray-100">
            <label
              v-for="item in itemResults"
              :key="item.id"
              class="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              <input
                type="checkbox"
                class="h-4 w-4 rounded accent-accent"
                :checked="selectedItems.has(item.id)"
                @change="toggleItem(item)"
              />
              <span class="flex-1">{{ item.name }}</span>
              <span class="text-xs text-gray-400 tabular-nums">{{ formatPeso(item.sell_price) }}</span>
            </label>
          </div>
        </div>

        <p v-if="error" class="col-span-2 text-sm text-red-600" role="alert">{{ error }}</p>
      </form>

      <template #footer>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn-secondary" @click="formOpen = false">Cancel</button>
          <button type="submit" form="promo-form" :disabled="busy" class="btn-primary">
            {{ busy ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </template>
    </AppModal>
  </div>
</template>
