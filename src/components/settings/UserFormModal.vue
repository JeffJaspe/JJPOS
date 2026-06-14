<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import AppModal from '@/components/ui/AppModal.vue'
import { useToast } from '@/composables/useToast'
import type { RoleRow, UserRow } from '../../../shared/types'

const props = defineProps<{
  open: boolean
  /** null = create a new user */
  user: UserRow | null
  roles: RoleRow[]
}>()

const emit = defineEmits<{ close: []; saved: [] }>()

const toast = useToast()

interface FormState {
  username: string
  full_name: string
  password: string
  role_id: number | null
  active: boolean
}

const form = reactive<FormState>(blank())
const error = ref('')
const busy = ref(false)

const isNew = computed(() => props.user === null)

function blank(): FormState {
  return { username: '', full_name: '', password: '', role_id: null, active: true }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    error.value = ''
    Object.assign(form, blank())
    if (props.user) {
      Object.assign(form, {
        username: props.user.username,
        full_name: props.user.full_name,
        role_id: props.user.role_id,
        active: props.user.active === 1
      })
    } else {
      form.role_id = props.roles[0]?.id ?? null
    }
  }
)

async function save(): Promise<void> {
  if (busy.value) return
  error.value = ''
  if (form.role_id == null) {
    error.value = 'Pick a role'
    return
  }
  busy.value = true
  try {
    if (isNew.value) {
      await window.api.users.create({
        username: form.username,
        full_name: form.full_name,
        password: form.password,
        role_id: form.role_id,
        active: form.active
      })
      toast.success('User created')
    } else {
      await window.api.users.update(props.user!.id, {
        full_name: form.full_name,
        role_id: form.role_id,
        active: form.active
      })
      toast.success('User saved')
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
    :title="isNew ? 'New User' : 'Edit User'"
    width="max-w-md"
    @close="emit('close')"
  >
    <form id="user-form" class="space-y-4" @submit.prevent="save">
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Username *</label>
        <input
          v-model="form.username"
          type="text"
          required
          autocomplete="off"
          class="input"
          :disabled="!isNew"
          :title="!isNew ? 'Username cannot be changed' : undefined"
        />
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Full name</label>
        <input v-model="form.full_name" type="text" class="input" />
      </div>

      <div v-if="isNew">
        <label class="mb-1 block text-sm font-medium text-gray-700">Password *</label>
        <input
          v-model="form.password"
          type="password"
          required
          autocomplete="new-password"
          placeholder="At least 6 characters"
          class="input"
        />
      </div>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Role *</label>
        <select v-model.number="form.role_id" class="input" :disabled="roles.length === 0">
          <option v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option>
        </select>
        <p v-if="roles.length === 0" class="mt-1 text-xs text-amber-600">
          No roles loaded. Fully restart the app and sign in again, then retry.
        </p>
      </div>

      <label class="flex items-center gap-2 text-sm font-medium text-gray-700">
        <input v-model="form.active" type="checkbox" class="h-4 w-4 rounded accent-accent" />
        Active (can sign in)
      </label>

      <p v-if="error" class="text-sm text-red-600" role="alert">{{ error }}</p>
    </form>

    <template #footer>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn-secondary" @click="emit('close')">Cancel</button>
        <button type="submit" form="user-form" :disabled="busy" class="btn-primary">
          {{ busy ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </template>
  </AppModal>
</template>
