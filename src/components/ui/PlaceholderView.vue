<script setup lang="ts">
// Stand-in body for views whose real implementation lands in a later phase.
defineProps<{ title: string; note: string }>()
</script>

<template>
  <div
    class="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white"
  >
    <h2 class="text-lg font-semibold text-gray-700">{{ title }}</h2>
    <p class="mt-1 text-sm text-gray-500">{{ note }}</p>
  </div>
</template>
