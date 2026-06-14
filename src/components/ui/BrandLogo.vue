<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { useSettingsStore } from '@/stores/settings'

/** Renders the branding mark — an uploaded image (data URL) or a built-in icon. */
withDefaults(defineProps<{ sizeClass?: string }>(), { sizeClass: 'h-6 w-6' })

const settings = useSettingsStore()
</script>

<template>
  <img
    v-if="settings.branding.logo_type === 'image' && settings.branding.logo_value"
    :src="settings.branding.logo_value"
    alt="Logo"
    :class="sizeClass"
    class="shrink-0 rounded object-contain"
  />
  <AppIcon
    v-else
    :name="settings.branding.logo_value || 'storefront'"
    :class="[sizeClass, 'shrink-0']"
    :style="{ color: 'var(--accent-2)' }"
  />
</template>
