<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import AppModal from '@/components/ui/AppModal.vue'

const props = defineProps<{
  open: boolean
  title: string
  message: string
  /** Permission the supervisor must hold (e.g. 'approve_voids'). */
  permission: string
  /** Short action label recorded in the audit log. */
  action: string
}>()
const emit = defineEmits<{
  close: []
  approved: [auth: { username: string; password: string }]
}>()

const username = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)
const userBox = ref<HTMLInputElement | null>(null)

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    username.value = ''
    password.value = ''
    error.value = ''
    await nextTick()
    userBox.value?.focus()
  }
)

async function confirm(): Promise<void> {
  if (busy.value) return
  error.value = ''
  if (!username.value.trim() || !password.value) {
    error.value = 'Enter supervisor credentials'
    return
  }
  busy.value = true
  try {
    await window.api.auth.verifySupervisor(
      username.value.trim(),
      password.value,
      props.permission,
      props.action
    )
    emit('approved', { username: username.value.trim(), password: password.value })
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Approval failed'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AppModal :open="open" :title="title" width="max-w-sm" @close="emit('close')">
    <form id="override-form" class="space-y-3" @submit.prevent="confirm">
      <p class="text-sm text-gray-600">{{ message }}</p>
      <input
        ref="userBox"
        v-model="username"
        type="text"
        placeholder="Supervisor username"
        autocomplete="off"
        class="input"
      />
      <input
        v-model="password"
        type="password"
        placeholder="Password"
        autocomplete="off"
        class="input"
      />
      <p v-if="error" class="text-sm text-red-600" role="alert">{{ error }}</p>
    </form>

    <template #footer>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn-secondary" @click="emit('close')">Cancel</button>
        <button type="submit" form="override-form" :disabled="busy" class="btn-primary">
          {{ busy ? 'Checking…' : 'Approve' }}
        </button>
      </div>
    </template>
  </AppModal>
</template>
