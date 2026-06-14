<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import BrandLogo from '@/components/ui/BrandLogo.vue'

const auth = useAuthStore()
const settings = useSettingsStore()
const router = useRouter()

const username = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)

async function submit(): Promise<void> {
  if (busy.value) return
  error.value = ''
  busy.value = true
  try {
    await auth.login(username.value.trim(), password.value)
    router.push('/')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Sign-in failed'
    password.value = ''
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex h-screen items-center justify-center bg-gray-100">
    <div class="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
      <div class="mb-6 flex flex-col items-center gap-3">
        <BrandLogo size-class="h-20 w-20" />
        <h1 class="text-xl font-semibold text-gray-900">{{ settings.branding.app_name }}</h1>
        <p class="text-sm text-gray-500">Sign in to continue</p>
      </div>

      <form class="space-y-4" @submit.prevent="submit">
        <div>
          <label for="username" class="mb-1 block text-sm font-medium text-gray-700">
            Username
          </label>
          <input
            id="username"
            v-model="username"
            type="text"
            autocomplete="username"
            autofocus
            required
            class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none"
          />
        </div>

        <div>
          <label for="password" class="mb-1 block text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            id="password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none"
          />
        </div>

        <p v-if="error" class="text-sm text-red-600" role="alert">{{ error }}</p>

        <button
          type="submit"
          :disabled="busy"
          class="w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition-transform duration-100 hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
        >
          {{ busy ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>
    </div>
  </div>
</template>
