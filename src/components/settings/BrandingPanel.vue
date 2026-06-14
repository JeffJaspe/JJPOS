<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import { useToast } from '@/composables/useToast'
import { useSettingsStore } from '@/stores/settings'
import type { Branding } from '../../../shared/types'

const toast = useToast()
const settings = useSettingsStore()

/** Built-in marks offered as logo choices (must exist in AppIcon). */
const ICONS = [
  'storefront',
  'shopping-cart',
  'cube',
  'archive-box',
  'book-open',
  'chart-bar',
  'tag',
  'gift',
  'sparkles',
  'bolt',
  'heart',
  'star',
  'fire',
  'building',
  'cake',
  'truck'
]

const ACCENT_PALETTE = [
  '#4f46e5',
  '#2563eb',
  '#0891b2',
  '#0d9488',
  '#059669',
  '#16a34a',
  '#d97706',
  '#ea580c',
  '#dc2626',
  '#e11d48',
  '#db2777',
  '#7c3aed',
  '#475569'
]
const SIDEBAR_PALETTE = [
  '#111827',
  '#1f2937',
  '#0f172a',
  '#1e293b',
  '#18181b',
  '#292524',
  '#1e3a8a',
  '#064e3b',
  '#3b0764',
  '#7f1d1d'
]

interface FormState {
  app_name: string
  accent_color: string
  accent_color_2: string
  sidebar_color: string
  logo_type: string
  logo_value: string
  favicon: string
}

const COLOR_FIELDS = [
  { key: 'accent_color', label: 'Primary — buttons, links, active items', palette: ACCENT_PALETTE },
  { key: 'accent_color_2', label: 'Secondary — logo mark', palette: ACCENT_PALETTE },
  { key: 'sidebar_color', label: 'Sidebar background', palette: SIDEBAR_PALETTE }
] as const

const MAX_LOGO_BYTES = 1_000_000

const form = reactive<FormState>({
  app_name: '',
  accent_color: '#4f46e5',
  accent_color_2: '#4f46e5',
  sidebar_color: '#111827',
  logo_type: 'icon',
  logo_value: 'storefront',
  favicon: ''
})
const fileInput = ref<HTMLInputElement | null>(null)
const faviconInput = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const error = ref('')

onMounted(() => {
  const b = settings.branding
  Object.assign(form, {
    app_name: b.app_name,
    accent_color: b.accent_color,
    accent_color_2: b.accent_color_2 || b.accent_color,
    sidebar_color: b.sidebar_color || '#111827',
    logo_type: b.logo_type,
    logo_value: b.logo_value,
    favicon: b.favicon ?? ''
  })
})

function pickIcon(name: string): void {
  form.logo_type = 'icon'
  form.logo_value = name
}

/** Read the chosen image entirely in the renderer (no IPC) into a data URL. */
async function onFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // allow re-picking the same file
  if (!file) return
  if (!file.type.startsWith('image/')) {
    toast.error('Please choose an image file')
    return
  }
  if (file.size > MAX_LOGO_BYTES) {
    toast.error('Image is too large (max 1 MB). Use a smaller logo.')
    return
  }
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Could not read the image'))
      reader.readAsDataURL(file)
    })
    form.logo_type = 'image'
    form.logo_value = dataUrl
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Could not read the image')
  }
}

/** Read a favicon (PNG or SVG) to a data URL. */
async function onFaviconFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!/^image\/(png|svg\+xml|x-icon|vnd\.microsoft\.icon)$/.test(file.type)) {
    toast.error('Favicon must be a PNG or SVG')
    return
  }
  if (file.size > 512_000) {
    toast.error('Favicon is too large (max 500 KB)')
    return
  }
  try {
    form.favicon = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Could not read the image'))
      reader.readAsDataURL(file)
    })
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Could not read the favicon')
  }
}

async function save(): Promise<void> {
  if (busy.value) return
  error.value = ''
  busy.value = true
  try {
    const payload: Branding = {
      app_name: form.app_name,
      accent_color: form.accent_color,
      accent_color_2: form.accent_color_2,
      sidebar_color: form.sidebar_color,
      logo_type: form.logo_type,
      logo_value: form.logo_value,
      favicon: form.favicon
    }
    await window.api.branding.set(payload)
    settings.setBranding(payload) // live-apply to sidebar/login/accent
    toast.success('Branding saved')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Save failed'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="grid max-w-4xl gap-6 lg:grid-cols-[1fr_18rem]">
    <!-- Editor -->
    <div class="space-y-6">
      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">App name / POS title</label>
        <input v-model="form.app_name" type="text" class="input max-w-sm" />
        <p class="mt-1 text-xs text-gray-400">Shown in the sidebar, the top bar, the login screen, and the window title.</p>
      </div>

      <div>
        <p class="mb-2 text-sm font-medium text-gray-700">Logo</p>
        <div class="mb-3 flex items-center gap-3">
          <input
            ref="fileInput"
            type="file"
            accept="image/png,image/jpeg,image/gif,image/svg+xml,image/webp"
            class="hidden"
            @change="onFile"
          />
          <button type="button" class="btn-secondary" @click="fileInput?.click()">
            Upload image…
          </button>
          <span
            v-if="form.logo_type === 'image' && form.logo_value"
            class="flex items-center gap-2 text-xs text-gray-500"
          >
            <img :src="form.logo_value" alt="Logo" class="h-8 w-8 rounded object-contain" />
            Custom image selected
          </span>
          <span v-else class="text-xs text-gray-400">PNG / JPG / SVG, up to 1 MB — or pick an icon below.</span>
        </div>
        <div class="grid grid-cols-8 gap-2" :class="form.logo_type === 'image' ? 'opacity-60' : ''">
          <button
            v-for="name in ICONS"
            :key="name"
            type="button"
            class="flex aspect-square items-center justify-center rounded-lg border transition-colors duration-100"
            :class="
              form.logo_type === 'icon' && form.logo_value === name
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-800'
            "
            :title="name"
            @click="pickIcon(name)"
          >
            <AppIcon :name="name" />
          </button>
        </div>
      </div>

      <!-- Three brand colors -->
      <div v-for="f in COLOR_FIELDS" :key="f.key">
        <p class="mb-2 text-sm font-medium text-gray-700">{{ f.label }}</p>
        <div class="flex flex-wrap items-center gap-2">
          <button
            v-for="c in f.palette"
            :key="c"
            type="button"
            class="h-8 w-8 rounded-full border-2 transition-transform duration-100 active:scale-90"
            :class="form[f.key].toLowerCase() === c ? 'border-gray-900' : 'border-transparent'"
            :style="{ backgroundColor: c }"
            :title="c"
            @click="form[f.key] = c"
          />
          <label class="ml-2 flex items-center gap-2 text-sm text-gray-600">
            Custom
            <input
              v-model="form[f.key]"
              type="color"
              class="h-8 w-10 cursor-pointer rounded border border-gray-200"
            />
          </label>
          <span class="font-mono text-xs text-gray-400">{{ form[f.key] }}</span>
        </div>
      </div>

      <!-- Favicon -->
      <div>
        <p class="mb-2 text-sm font-medium text-gray-700">App icon / favicon</p>
        <input
          ref="faviconInput"
          type="file"
          accept="image/png,image/svg+xml,image/x-icon"
          class="hidden"
          @change="onFaviconFile"
        />
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded border border-gray-200 bg-gray-50">
            <img v-if="form.favicon" :src="form.favicon" alt="Favicon" class="h-8 w-8 object-contain" />
            <AppIcon v-else name="storefront" class="h-5 w-5 text-gray-300" />
          </div>
          <button type="button" class="btn-secondary" @click="faviconInput?.click()">Upload PNG / SVG</button>
          <button
            v-if="form.favicon"
            type="button"
            class="text-sm font-medium text-red-600 hover:opacity-80"
            @click="form.favicon = ''"
          >
            Remove
          </button>
        </div>
        <p class="mt-1 text-xs text-gray-400">
          Shown in the window title bar &amp; taskbar (PNG works best there; SVG sets the in-app icon).
        </p>
      </div>

      <p v-if="error" class="text-sm text-red-600" role="alert">{{ error }}</p>

      <div>
        <button class="btn-primary px-8" :disabled="busy" @click="save">
          {{ busy ? 'Saving…' : 'Save branding' }}
        </button>
      </div>
    </div>

    <!-- Live preview -->
    <div>
      <p class="mb-2 text-sm font-medium text-gray-700">Preview</p>
      <div class="overflow-hidden rounded-lg border border-gray-200">
        <div class="flex h-14 items-center gap-3 px-4 text-white" :style="{ backgroundColor: form.sidebar_color }">
          <img
            v-if="form.logo_type === 'image' && form.logo_value"
            :src="form.logo_value"
            alt="Logo"
            class="h-8 w-8 rounded object-contain"
          />
          <AppIcon
            v-else
            :name="form.logo_value || 'storefront'"
            class="h-8 w-8"
            :style="{ color: form.accent_color_2 }"
          />
          <span class="truncate text-base font-semibold">{{ form.app_name || 'App name' }}</span>
        </div>
        <div class="space-y-3 bg-white p-4">
          <button
            class="w-full rounded-md px-4 py-2 text-sm font-semibold text-white"
            :style="{ backgroundColor: form.accent_color }"
          >
            Primary button
          </button>
          <p class="text-sm" :style="{ color: form.accent_color }">Accent link / active item</p>
          <span
            class="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
            :style="{ backgroundColor: form.accent_color_2 }"
          >
            Secondary
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
