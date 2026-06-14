<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import AppModal from '@/components/ui/AppModal.vue'
import { useToast } from '@/composables/useToast'
import {
  MENU_KEYS,
  MENU_LABELS,
  PERM_KEYS,
  PERM_LABELS,
  type PermKey,
  type RoleRow
} from '../../../shared/types'

const props = defineProps<{
  open: boolean
  /** null = create a new role */
  role: RoleRow | null
}>()

const emit = defineEmits<{ close: []; saved: [] }>()

const toast = useToast()

/** Permissions grouped into meaningful categories for the editor. */
const PERM_GROUPS: { title: string; hint: string; perms: PermKey[] }[] = [
  {
    title: 'Point of Sale',
    hint: 'Selling, voids, discounts and price changes at the register',
    perms: ['sell', 'void', 'approve_voids', 'price_override', 'discount', 'require_customer']
  },
  {
    title: 'Items & Inventory',
    hint: 'Maintaining products, promos, vouchers and stock',
    perms: ['edit_items', 'manage_vouchers', 'stock_adjust']
  },
  {
    title: 'Customers & AR',
    hint: 'Customer masterfile, credit and ledger collections',
    perms: ['edit_customers', 'manage_ledger']
  },
  {
    title: 'Reports',
    hint: 'Sales reports and security/audit logs',
    perms: ['export_reports', 'view_audit']
  },
  {
    title: 'Administration',
    hint: 'Users, branding and store settings',
    perms: ['manage_users', 'manage_branding', 'manage_settings']
  }
]
// Catch any permission not placed in a group above (future-proofing).
const grouped = new Set(PERM_GROUPS.flatMap((g) => g.perms))
const leftover = PERM_KEYS.filter((p) => !grouped.has(p))
const GROUPS = leftover.length
  ? [...PERM_GROUPS, { title: 'Other', hint: '', perms: leftover }]
  : PERM_GROUPS

const name = ref('')
const menus = reactive<Record<string, boolean>>({})
const perms = reactive<Record<string, boolean>>({})
const error = ref('')
const busy = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    error.value = ''
    name.value = props.role?.name ?? ''
    for (const m of MENU_KEYS) menus[m] = props.role?.menus.includes(m) ?? false
    for (const p of PERM_KEYS) perms[p] = props.role?.permissions.includes(p) ?? false
  }
)

const allMenus = computed(() => MENU_KEYS.every((m) => menus[m]))
function toggleAllMenus(value: boolean): void {
  for (const m of MENU_KEYS) menus[m] = value
}

function groupChecked(keys: PermKey[]): boolean {
  return keys.every((k) => perms[k])
}
function setGroup(keys: PermKey[], value: boolean): void {
  for (const k of keys) perms[k] = value
}
const selectedCount = computed(() => PERM_KEYS.filter((p) => perms[p]).length)

async function save(): Promise<void> {
  if (busy.value) return
  error.value = ''
  busy.value = true
  try {
    const input = {
      name: name.value,
      menus: MENU_KEYS.filter((m) => menus[m]),
      permissions: PERM_KEYS.filter((p) => perms[p])
    }
    if (props.role === null) {
      await window.api.roles.create(input)
      toast.success('Role created')
    } else {
      await window.api.roles.update(props.role.id, input)
      toast.success('Role saved')
    }
    emit('saved')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Save failed'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AppModal
    :open="open"
    :title="role === null ? 'New Role' : `Edit Role — ${role.name}`"
    width="max-w-3xl"
    @close="emit('close')"
  >
    <form id="role-form" class="space-y-5" @submit.prevent="save">
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Role name *</label>
        <input v-model="name" type="text" required class="input max-w-sm" placeholder="e.g. Manager" />
      </div>

      <!-- Sidebar menus -->
      <section class="rounded-lg border border-gray-200">
        <header class="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
          <div>
            <h3 class="text-sm font-semibold text-gray-900">Sidebar menus</h3>
            <p class="text-xs text-gray-400">Which sections appear in the navigation</p>
          </div>
          <label class="flex items-center gap-1.5 text-xs font-medium text-gray-500">
            <input
              type="checkbox"
              class="h-3.5 w-3.5 rounded accent-accent"
              :checked="allMenus"
              @change="toggleAllMenus(($event.target as HTMLInputElement).checked)"
            />
            All
          </label>
        </header>
        <div class="grid grid-cols-2 gap-x-6 gap-y-2 px-4 py-3 sm:grid-cols-3">
          <label v-for="m in MENU_KEYS" :key="m" class="flex items-center gap-2 text-sm text-gray-700">
            <input v-model="menus[m]" type="checkbox" class="h-4 w-4 rounded accent-accent" />
            {{ MENU_LABELS[m] }}
          </label>
        </div>
      </section>

      <!-- Permissions, grouped -->
      <div>
        <div class="mb-2 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-gray-900">Permissions</h3>
          <span class="text-xs text-gray-400">{{ selectedCount }} selected</span>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <section v-for="g in GROUPS" :key="g.title" class="rounded-lg border border-gray-200">
            <header class="flex items-center justify-between border-b border-gray-100 px-4 py-2">
              <div>
                <h4 class="text-sm font-medium text-gray-800">{{ g.title }}</h4>
                <p v-if="g.hint" class="text-[11px] text-gray-400">{{ g.hint }}</p>
              </div>
              <label class="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                <input
                  type="checkbox"
                  class="h-3.5 w-3.5 rounded accent-accent"
                  :checked="groupChecked(g.perms)"
                  @change="setGroup(g.perms, ($event.target as HTMLInputElement).checked)"
                />
                All
              </label>
            </header>
            <div class="space-y-2 px-4 py-3">
              <label
                v-for="p in g.perms"
                :key="p"
                class="flex items-center gap-2 text-sm text-gray-700"
              >
                <input v-model="perms[p]" type="checkbox" class="h-4 w-4 rounded accent-accent" />
                {{ PERM_LABELS[p] }}
              </label>
            </div>
          </section>
        </div>
      </div>

      <p v-if="error" class="text-sm text-red-600" role="alert">{{ error }}</p>
    </form>

    <template #footer>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn-secondary" @click="emit('close')">Cancel</button>
        <button type="submit" form="role-form" :disabled="busy" class="btn-primary">
          {{ busy ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </template>
  </AppModal>
</template>
