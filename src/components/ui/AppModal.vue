<script setup lang="ts">
import { watch, onBeforeUnmount } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps<{
  open: boolean
  title: string
  /** Tailwind max-width class for the panel; defaults to max-w-lg. */
  width?: string
}>()

const emit = defineEmits<{ close: [] }>()

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (open) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  }
)
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="fixed inset-0 z-40 flex items-center justify-center p-4">
        <div class="modal-backdrop absolute inset-0 bg-black/40" @click="emit('close')" />
        <div
          class="modal-panel relative flex max-h-full w-full flex-col rounded-xl bg-white shadow-xl"
          :class="width ?? 'max-w-lg'"
          role="dialog"
          aria-modal="true"
        >
          <header class="flex items-center justify-between border-b border-gray-200 px-5 py-3">
            <h2 class="text-base font-semibold text-gray-900">{{ title }}</h2>
            <button
              class="rounded-md p-1 text-gray-400 transition-colors duration-100 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Close"
              @click="emit('close')"
            >
              <AppIcon name="x-circle" />
            </button>
          </header>
          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="border-t border-gray-200 px-5 py-3">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
