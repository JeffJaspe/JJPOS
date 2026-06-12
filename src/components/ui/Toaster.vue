<script setup lang="ts">
import { useToast } from '@/composables/useToast'
import AppIcon from './AppIcon.vue'

const { toasts, dismiss } = useToast()

const ICON: Record<string, string> = {
  success: 'check',
  error: 'x-circle',
  info: 'info'
}

const COLOR: Record<string, string> = {
  success: 'text-green-600',
  error: 'text-red-600',
  info: 'text-blue-600'
}
</script>

<template>
  <div class="pointer-events-none fixed top-4 right-4 z-50 flex w-80 flex-col gap-2">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="pointer-events-auto flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-lg"
        role="status"
        @click="dismiss(toast.id)"
      >
        <AppIcon :name="ICON[toast.type]" :class="COLOR[toast.type]" />
        <p class="text-sm text-gray-800">{{ toast.message }}</p>
      </div>
    </TransitionGroup>
  </div>
</template>
