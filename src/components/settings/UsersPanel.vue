<script setup lang="ts">
import { onMounted, ref } from 'vue'
import UserFormModal from './UserFormModal.vue'
import PasswordResetModal from './PasswordResetModal.vue'
import { useToast } from '@/composables/useToast'
import { formatDate } from '@/utils/datetime'
import type { RoleRow, UserRow } from '../../../shared/types'

const toast = useToast()

const users = ref<UserRow[]>([])
const roles = ref<RoleRow[]>([])
const loading = ref(false)

const formOpen = ref(false)
const editing = ref<UserRow | null>(null)
const resetOpen = ref(false)
const resetting = ref<UserRow | null>(null)

/**
 * Load users and roles independently so one failing IPC call doesn't blank the
 * other, and surface the real error (e.g. a stale preload missing window.api.roles
 * after a renderer-only hot reload) instead of silently showing an empty list.
 */
async function safeLoad<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    toast.error(`Could not load ${label}: ${err instanceof Error ? err.message : String(err)}`)
    return fallback
  }
}

async function load(): Promise<void> {
  loading.value = true
  try {
    ;[users.value, roles.value] = await Promise.all([
      safeLoad('users', () => window.api.users.list(), []),
      safeLoad('roles', () => window.api.roles.list(), [])
    ])
  } finally {
    loading.value = false
  }
}

onMounted(load)

function openNew(): void {
  editing.value = null
  formOpen.value = true
}

function openEdit(user: UserRow): void {
  editing.value = user
  formOpen.value = true
}

function openReset(user: UserRow): void {
  resetting.value = user
  resetOpen.value = true
}

function onSaved(): void {
  formOpen.value = false
  resetOpen.value = false
  load()
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center">
      <p class="text-sm text-gray-500">User accounts and the role each one signs in with.</p>
      <button class="btn-primary ml-auto" @click="openNew">New User</button>
    </div>

    <div class="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
          <tr>
            <th class="px-4 py-3">Username</th>
            <th class="px-4 py-3">Full name</th>
            <th class="px-4 py-3">Role</th>
            <th class="px-4 py-3 text-center">Status</th>
            <th class="px-4 py-3">Created</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <TransitionGroup name="rows" tag="tbody" class="divide-y divide-gray-100">
          <tr v-for="u in users" :key="u.id" :class="{ 'opacity-50': !u.active }">
            <td class="px-4 py-2.5 font-medium text-gray-900">{{ u.username }}</td>
            <td class="px-4 py-2.5 text-gray-600">{{ u.full_name || '—' }}</td>
            <td class="px-4 py-2.5 text-gray-600">{{ u.role_name }}</td>
            <td class="px-4 py-2.5 text-center">
              <span
                class="rounded-full px-2 py-0.5 text-xs font-medium"
                :class="u.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'"
              >
                {{ u.active ? 'Active' : 'Inactive' }}
              </span>
            </td>
            <td class="px-4 py-2.5 text-gray-500">{{ formatDate(u.created_at) }}</td>
            <td class="px-4 py-2.5 text-right whitespace-nowrap">
              <button
                class="mr-3 text-sm font-medium text-accent transition-colors duration-100 hover:opacity-80"
                @click="openReset(u)"
              >
                Reset PW
              </button>
              <button
                class="text-sm font-medium text-accent transition-colors duration-100 hover:opacity-80"
                @click="openEdit(u)"
              >
                Edit
              </button>
            </td>
          </tr>
        </TransitionGroup>
      </table>
      <p v-if="!loading && users.length === 0" class="py-10 text-center text-sm text-gray-400">
        No users yet.
      </p>
    </div>

    <UserFormModal
      :open="formOpen"
      :user="editing"
      :roles="roles"
      @close="formOpen = false"
      @saved="onSaved"
    />
    <PasswordResetModal
      :open="resetOpen"
      :user="resetting"
      @close="resetOpen = false"
      @saved="onSaved"
    />
  </div>
</template>
