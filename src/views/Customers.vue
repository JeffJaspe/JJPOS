<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import CustomerFormModal from '@/components/customers/CustomerFormModal.vue'
import { usePermissions } from '@/composables/usePermissions'
import { formatPeso } from '@/utils/money'
import type { CustomerRow } from '../../shared/types'

const { can } = usePermissions()
const canEdit = can('edit_customers')

const customers = ref<CustomerRow[]>([])
const search = ref('')
const showInactive = ref(false)
const loading = ref(false)

const formOpen = ref(false)
const editing = ref<CustomerRow | null>(null)

async function load(): Promise<void> {
  loading.value = true
  try {
    customers.value = await window.api.customers.list({
      search: search.value,
      includeInactive: showInactive.value
    })
  } finally {
    loading.value = false
  }
}
onMounted(load)

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(load, 250)
})
watch(showInactive, load)

function openNew(): void {
  editing.value = null
  formOpen.value = true
}

function openEdit(customer: CustomerRow): void {
  editing.value = customer
  formOpen.value = true
}

function onSaved(): void {
  formOpen.value = false
  load()
}

function termsLabel(days: number): string {
  return days === 0 ? 'COD' : `${days} days`
}
</script>

<template>
  <div class="space-y-4">
    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-3">
      <input
        v-model="search"
        type="text"
        placeholder="Search code, name, or contact…"
        class="input max-w-xs"
      />
      <label class="flex items-center gap-2 text-sm text-gray-600">
        <input v-model="showInactive" type="checkbox" class="h-4 w-4 rounded" />
        Show inactive
      </label>
      <button v-if="canEdit" class="btn-primary ml-auto" @click="openNew">New Customer</button>
    </div>

    <!-- Table -->
    <div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
          <tr>
            <th class="px-4 py-3">Code</th>
            <th class="px-4 py-3">Name</th>
            <th class="px-4 py-3">Contact</th>
            <th class="px-4 py-3 text-right">Credit limit</th>
            <th class="px-4 py-3">Terms</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <TransitionGroup name="rows" tag="tbody" class="divide-y divide-gray-100">
          <tr v-for="c in customers" :key="c.id" :class="{ 'opacity-50': !c.active }">
            <td class="px-4 py-2.5 font-mono text-xs">{{ c.code }}</td>
            <td class="px-4 py-2.5 font-medium text-gray-900">{{ c.name }}</td>
            <td class="px-4 py-2.5 text-gray-500">{{ c.contact || '—' }}</td>
            <td class="px-4 py-2.5 text-right tabular-nums">
              {{ c.credit_limit > 0 ? formatPeso(c.credit_limit) : '—' }}
            </td>
            <td class="px-4 py-2.5 text-gray-500">{{ termsLabel(c.terms_days) }}</td>
            <td class="px-4 py-2.5 text-right">
              <button
                v-if="canEdit"
                class="text-sm font-medium text-accent transition-colors duration-100 hover:opacity-80"
                @click="openEdit(c)"
              >
                Edit
              </button>
            </td>
          </tr>
        </TransitionGroup>
      </table>
      <p v-if="!loading && customers.length === 0" class="py-10 text-center text-sm text-gray-400">
        No customers found. {{ canEdit ? 'Create your first customer with “New Customer”.' : '' }}
      </p>
    </div>

    <CustomerFormModal
      :open="formOpen"
      :customer="editing"
      @close="formOpen = false"
      @saved="onSaved"
    />
  </div>
</template>
