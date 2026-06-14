<script setup lang="ts">
import { onMounted, ref } from 'vue'
import RoleEditorModal from './RoleEditorModal.vue'
import { useToast } from '@/composables/useToast'
import { MENU_LABELS, PERM_LABELS, type RoleRow } from '../../../shared/types'

const toast = useToast()

const roles = ref<RoleRow[]>([])
const loading = ref(false)
const formOpen = ref(false)
const editing = ref<RoleRow | null>(null)

async function load(): Promise<void> {
  loading.value = true
  try {
    roles.value = await window.api.roles.list()
  } finally {
    loading.value = false
  }
}

onMounted(load)

function openNew(): void {
  editing.value = null
  formOpen.value = true
}

function openEdit(role: RoleRow): void {
  editing.value = role
  formOpen.value = true
}

function onSaved(): void {
  formOpen.value = false
  load()
}

async function remove(role: RoleRow): Promise<void> {
  if (!confirm(`Delete the role “${role.name}”? This cannot be undone.`)) return
  try {
    await window.api.roles.remove(role.id)
    toast.success(`Deleted role ${role.name}`)
    load()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Delete failed')
  }
}

function menuSummary(role: RoleRow): string {
  if (role.menus.length === 0) return '—'
  return role.menus.map((m) => MENU_LABELS[m as keyof typeof MENU_LABELS] ?? m).join(', ')
}

function permSummary(role: RoleRow): string {
  if (role.permissions.length === 0) return '—'
  return role.permissions.map((p) => PERM_LABELS[p as keyof typeof PERM_LABELS] ?? p).join(', ')
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center">
      <p class="text-sm text-gray-500">
        Roles control which sidebar menus appear and which actions a user may perform.
      </p>
      <button class="btn-primary ml-auto" @click="openNew">New Role</button>
    </div>

    <div class="space-y-3">
      <div
        v-for="role in roles"
        :key="role.id"
        class="rounded-lg border border-gray-200 bg-white p-4"
      >
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <h3 class="font-semibold text-gray-900">{{ role.name }}</h3>
              <span
                v-if="role.locked"
                class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
              >
                Locked
              </span>
              <span
                v-else-if="role.is_system"
                class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500"
              >
                Built-in
              </span>
              <span class="text-xs text-gray-400">
                {{ role.user_count }} user{{ role.user_count === 1 ? '' : 's' }}
              </span>
            </div>
            <p class="mt-2 text-xs text-gray-500">
              <span class="font-medium text-gray-600">Menus:</span> {{ menuSummary(role) }}
            </p>
            <p class="mt-1 text-xs text-gray-500">
              <span class="font-medium text-gray-600">Permissions:</span> {{ permSummary(role) }}
            </p>
          </div>
          <div class="flex shrink-0 gap-3">
            <button
              v-if="!role.locked"
              class="text-sm font-medium text-accent transition-colors duration-100 hover:opacity-80"
              @click="openEdit(role)"
            >
              Edit
            </button>
            <button
              v-if="!role.locked && !role.is_system"
              class="text-sm font-medium text-red-600 transition-colors duration-100 hover:opacity-80"
              @click="remove(role)"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
      <p v-if="!loading && roles.length === 0" class="py-10 text-center text-sm text-gray-400">
        No roles defined.
      </p>
    </div>

    <RoleEditorModal :open="formOpen" :role="editing" @close="formOpen = false" @saved="onSaved" />
  </div>
</template>
