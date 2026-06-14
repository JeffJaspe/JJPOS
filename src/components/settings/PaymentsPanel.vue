<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useToast } from '@/composables/useToast'
import { useSettingsStore } from '@/stores/settings'

const toast = useToast()
const settings = useSettingsStore()

interface FormState {
  card_enabled: boolean
  card_reader_enabled: boolean
  card_reader_name: string
  gcash_enabled: boolean
  gcash_account_name: string
  gcash_number: string
  paymaya_enabled: boolean
  paymaya_account_name: string
  paymaya_number: string
}

const form = reactive<FormState>({
  card_enabled: true,
  card_reader_enabled: false,
  card_reader_name: '',
  gcash_enabled: true,
  gcash_account_name: '',
  gcash_number: '',
  paymaya_enabled: true,
  paymaya_account_name: '',
  paymaya_number: ''
})
const busy = ref(false)

onMounted(async () => {
  await settings.loadAppSettings()
  const a = settings.app
  Object.assign(form, {
    card_enabled: (a.card_enabled ?? '1') === '1',
    card_reader_enabled: (a.card_reader_enabled ?? '0') === '1',
    card_reader_name: a.card_reader_name ?? '',
    gcash_enabled: (a.gcash_enabled ?? '1') === '1',
    gcash_account_name: a.gcash_account_name ?? '',
    gcash_number: a.gcash_number ?? '',
    paymaya_enabled: (a.paymaya_enabled ?? '1') === '1',
    paymaya_account_name: a.paymaya_account_name ?? '',
    paymaya_number: a.paymaya_number ?? ''
  })
})

async function save(): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    const kv: Record<string, string> = {
      card_enabled: form.card_enabled ? '1' : '0',
      card_reader_enabled: form.card_reader_enabled ? '1' : '0',
      card_reader_name: form.card_reader_name.trim(),
      gcash_enabled: form.gcash_enabled ? '1' : '0',
      gcash_account_name: form.gcash_account_name.trim(),
      gcash_number: form.gcash_number.trim(),
      paymaya_enabled: form.paymaya_enabled ? '1' : '0',
      paymaya_account_name: form.paymaya_account_name.trim(),
      paymaya_number: form.paymaya_number.trim()
    }
    for (const [key, value] of Object.entries(kv)) {
      await window.api.settings.set(key, value)
    }
    settings.setAppSettings(kv)
    toast.success('Payment settings saved')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Save failed')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl space-y-5">
    <p class="text-sm text-gray-500">
      Upfront payment options offered at the register. Disabled methods are hidden at checkout.
    </p>

    <!-- Card -->
    <section class="rounded-lg border border-gray-200">
      <header class="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
        <h3 class="text-sm font-semibold text-gray-900">Credit / Debit Card</h3>
        <label class="flex items-center gap-2 text-xs font-medium text-gray-600">
          <input v-model="form.card_enabled" type="checkbox" class="h-4 w-4 rounded accent-accent" />
          Accept
        </label>
      </header>
      <div class="space-y-3 px-4 py-3" :class="form.card_enabled ? '' : 'opacity-50'">
        <label class="flex items-center gap-2 text-sm text-gray-700">
          <input
            v-model="form.card_reader_enabled"
            type="checkbox"
            class="h-4 w-4 rounded accent-accent"
            :disabled="!form.card_enabled"
          />
          Use a physical card reader
        </label>
        <div class="max-w-sm">
          <label class="mb-1 block text-sm font-medium text-gray-700">Reader device / port</label>
          <input
            v-model="form.card_reader_name"
            type="text"
            class="input"
            placeholder="e.g. COM3 or device name"
            :disabled="!form.card_enabled || !form.card_reader_enabled"
          />
          <p class="mt-1 text-xs text-gray-400">Hardware integration is wired in later.</p>
        </div>
      </div>
    </section>

    <!-- GCash -->
    <section class="rounded-lg border border-gray-200">
      <header class="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
        <h3 class="text-sm font-semibold text-gray-900">GCash</h3>
        <label class="flex items-center gap-2 text-xs font-medium text-gray-600">
          <input v-model="form.gcash_enabled" type="checkbox" class="h-4 w-4 rounded accent-accent" />
          Accept
        </label>
      </header>
      <div class="grid grid-cols-2 gap-4 px-4 py-3" :class="form.gcash_enabled ? '' : 'opacity-50'">
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Account name</label>
          <input v-model="form.gcash_account_name" type="text" class="input" :disabled="!form.gcash_enabled" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Mobile number</label>
          <input v-model="form.gcash_number" type="text" class="input" placeholder="09xx xxx xxxx" :disabled="!form.gcash_enabled" />
        </div>
      </div>
    </section>

    <!-- PayMaya -->
    <section class="rounded-lg border border-gray-200">
      <header class="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
        <h3 class="text-sm font-semibold text-gray-900">PayMaya / Maya</h3>
        <label class="flex items-center gap-2 text-xs font-medium text-gray-600">
          <input v-model="form.paymaya_enabled" type="checkbox" class="h-4 w-4 rounded accent-accent" />
          Accept
        </label>
      </header>
      <div class="grid grid-cols-2 gap-4 px-4 py-3" :class="form.paymaya_enabled ? '' : 'opacity-50'">
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Account name</label>
          <input v-model="form.paymaya_account_name" type="text" class="input" :disabled="!form.paymaya_enabled" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-gray-700">Mobile number</label>
          <input v-model="form.paymaya_number" type="text" class="input" placeholder="09xx xxx xxxx" :disabled="!form.paymaya_enabled" />
        </div>
      </div>
    </section>

    <div>
      <button class="btn-primary px-8" :disabled="busy" @click="save">
        {{ busy ? 'Saving…' : 'Save payment settings' }}
      </button>
    </div>
  </div>
</template>
