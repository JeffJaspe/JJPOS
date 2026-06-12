<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import ItemFormModal from '@/components/items/ItemFormModal.vue'
import LabelPrintModal from '@/components/items/LabelPrintModal.vue'
import CategoriesPanel from '@/components/items/CategoriesPanel.vue'
import SuppliersPanel from '@/components/items/SuppliersPanel.vue'
import { usePermissions } from '@/composables/usePermissions'
import { formatPeso } from '@/utils/money'
import type { Category, ItemRow } from '../../shared/types'

const { can } = usePermissions()
const canEdit = can('edit_items')

const TABS = ['Items', 'Categories', 'Suppliers'] as const
const tab = ref<(typeof TABS)[number]>('Items')

const items = ref<ItemRow[]>([])
const categories = ref<Category[]>([])
const search = ref('')
const categoryFilter = ref<number | null>(null)
const showInactive = ref(false)
const loading = ref(false)

const formOpen = ref(false)
const editingId = ref<number | null>(null)
const labelItem = ref<ItemRow | null>(null)
const labelOpen = ref(false)

async function load(): Promise<void> {
  loading.value = true
  try {
    items.value = await window.api.items.list({
      search: search.value,
      categoryId: categoryFilter.value,
      includeInactive: showInactive.value
    })
  } finally {
    loading.value = false
  }
}

async function loadCategories(): Promise<void> {
  categories.value = await window.api.categories.list()
}

onMounted(() => {
  load()
  loadCategories()
})

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(load, 250)
})
watch([categoryFilter, showInactive], load)

function openNew(): void {
  editingId.value = null
  formOpen.value = true
}

function openEdit(item: ItemRow): void {
  editingId.value = item.id
  formOpen.value = true
}

function openLabels(item: ItemRow): void {
  labelItem.value = item
  labelOpen.value = true
}

function onSaved(): void {
  formOpen.value = false
  load()
}

function lowStock(item: ItemRow): boolean {
  return item.reorder_level > 0 && item.qty_on_hand <= item.reorder_level
}
</script>

<template>
  <div class="space-y-4">
    <!-- Tabs -->
    <div class="flex gap-1 border-b border-gray-200">
      <button
        v-for="t in TABS"
        :key="t"
        class="border-b-2 px-4 py-2 text-sm font-medium transition-colors duration-100"
        :class="
          tab === t
            ? 'border-accent text-accent'
            : 'border-transparent text-gray-500 hover:text-gray-800'
        "
        @click="tab = t"
      >
        {{ t }}
      </button>
    </div>

    <template v-if="tab === 'Items'">
      <!-- Toolbar -->
      <div class="flex flex-wrap items-center gap-3">
        <input
          v-model="search"
          type="text"
          placeholder="Search name, SKU, or scan barcode…"
          class="input max-w-xs"
        />
        <select v-model="categoryFilter" class="input max-w-44">
          <option :value="null">All categories</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <label class="flex items-center gap-2 text-sm text-gray-600">
          <input v-model="showInactive" type="checkbox" class="h-4 w-4 rounded" />
          Show inactive
        </label>
        <button v-if="canEdit" class="btn-primary ml-auto" @click="openNew">New Item</button>
      </div>

      <!-- Table -->
      <div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
            <tr>
              <th class="px-4 py-3">SKU</th>
              <th class="px-4 py-3">Name</th>
              <th class="px-4 py-3">Category</th>
              <th class="px-4 py-3">Unit</th>
              <th class="px-4 py-3 text-right">Cost</th>
              <th class="px-4 py-3 text-right">Price</th>
              <th class="px-4 py-3 text-right">Stock</th>
              <th class="px-4 py-3 text-center">Barcodes</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <TransitionGroup name="rows" tag="tbody" class="divide-y divide-gray-100">
            <tr v-for="item in items" :key="item.id" :class="{ 'opacity-50': !item.active }">
              <td class="px-4 py-2.5 font-mono text-xs">{{ item.sku }}</td>
              <td class="px-4 py-2.5 font-medium text-gray-900">{{ item.name }}</td>
              <td class="px-4 py-2.5 text-gray-500">{{ item.category_name ?? '—' }}</td>
              <td class="px-4 py-2.5 text-gray-500">{{ item.unit }}</td>
              <td class="px-4 py-2.5 text-right tabular-nums">{{ formatPeso(item.cost_price) }}</td>
              <td class="px-4 py-2.5 text-right font-medium tabular-nums">
                {{ formatPeso(item.sell_price) }}
              </td>
              <td
                class="px-4 py-2.5 text-right tabular-nums"
                :class="lowStock(item) ? 'font-semibold text-red-600' : ''"
              >
                {{ item.qty_on_hand }}
              </td>
              <td class="px-4 py-2.5 text-center text-gray-500">{{ item.barcode_count }}</td>
              <td class="px-4 py-2.5 text-right whitespace-nowrap">
                <button
                  class="mr-3 text-sm font-medium text-accent transition-colors duration-100 hover:opacity-80"
                  @click="openLabels(item)"
                >
                  Labels
                </button>
                <button
                  v-if="canEdit"
                  class="text-sm font-medium text-accent transition-colors duration-100 hover:opacity-80"
                  @click="openEdit(item)"
                >
                  Edit
                </button>
              </td>
            </tr>
          </TransitionGroup>
        </table>
        <p v-if="!loading && items.length === 0" class="py-10 text-center text-sm text-gray-400">
          No items found. {{ canEdit ? 'Create your first item with “New Item”.' : '' }}
        </p>
      </div>
    </template>

    <CategoriesPanel v-else-if="tab === 'Categories'" @changed="loadCategories" />
    <SuppliersPanel v-else />

    <ItemFormModal
      :open="formOpen"
      :item-id="editingId"
      :categories="categories"
      @close="formOpen = false"
      @saved="onSaved"
    />
    <LabelPrintModal :open="labelOpen" :item="labelItem" @close="labelOpen = false" />
  </div>
</template>
