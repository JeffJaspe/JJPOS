<script setup lang="ts">
import { ref, watch } from 'vue'
import AppModal from '@/components/ui/AppModal.vue'
import { useToast } from '@/composables/useToast'
import type { UserRow } from '../../../shared/types'

const props = defineProps<{ open: boolean; user: UserRow | null }>()
const emit = defineEmits<{ close: []; saved: [] }>()

const toast = useToast()
const password = ref('')
const confirm = ref('')
const error = ref('')
const busy = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    password.value = ''
    confirm.value = ''
    error.value = ''
  }
)

async function save(): Promise<void> {
  if (busy.value || !props.user) return
  error.value = ''
  if (password.value !== confirm.value) {
    error.value = 'Passwords do not match'
    return
  }
  busy.value = true
  try {
    await window.api.users.setPassword(props.user.id, password.value)
    toast.success(`Password reset for ${props.user.username}`)
    emit('saved')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Reset failed'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AppModal
    :open="open"
    :title="user ? `Reset password — ${user.username}` : 'Reset password'"
    width="max-w-sm"
    @close="emit('close')"
  >
    <form id="password-reset-form" class="space-y-4" @submit.prevent="save">
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">New password *</label>
        <input
          v-model="password"
          type="password"
          required
          autocomplete="new-password"
          placeholder="At least 6 characters"
          class="input"
        />
      </div>
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Confirm password *</label>
        <input v-model="confirm" type="password" required autocomplete="new-password" class="input" />
      </div>
      <p v-if="error" class="text-sm text-red-600" role="alert">{{ error }}</p>
    </form>

    <template #footer>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn-secondary" @click="emit('close')">Cancel</button>
        <button type="submit" form="password-reset-form" :disabled="busy" class="btn-primary">
          {{ busy ? 'Saving…' : 'Reset password' }}
        </button>
      </div>
    </template>
  </AppModal>
</template>
