<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import JsBarcode from 'jsbarcode'
import { isValidEan13 } from '../../../shared/barcode'

const props = defineProps<{
  code: string
  height?: number
}>()

const svg = ref<SVGSVGElement | null>(null)

function render(): void {
  if (!svg.value || !props.code) return
  try {
    JsBarcode(svg.value, props.code, {
      format: isValidEan13(props.code) ? 'EAN13' : 'CODE128',
      height: props.height ?? 40,
      width: 1.5,
      fontSize: 12,
      margin: 4
    })
  } catch {
    // Unrenderable code (bad characters) — leave the SVG empty.
  }
}

onMounted(render)
watch(() => props.code, render)
</script>

<template>
  <svg ref="svg" />
</template>
