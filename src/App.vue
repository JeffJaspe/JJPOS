<script setup lang="ts">
import { onMounted } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import Toaster from '@/components/ui/Toaster.vue'

const settings = useSettingsStore()
onMounted(() => settings.loadBranding())
</script>

<template>
  <RouterView />
  <Toaster />
</template>
