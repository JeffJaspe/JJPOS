<script setup lang="ts">
import { ref } from 'vue'
import StockInPanel from '@/components/inventory/StockInPanel.vue'
import AdjustPanel from '@/components/inventory/AdjustPanel.vue'
import StocktakePanel from '@/components/inventory/StocktakePanel.vue'
import MovementsPanel from '@/components/inventory/MovementsPanel.vue'
import LowStockPanel from '@/components/inventory/LowStockPanel.vue'
import { usePermissions } from '@/composables/usePermissions'

const { can } = usePermissions()
const canAdjust = can('stock_adjust')

type Tab = 'Stock In' | 'Adjust' | 'Stocktake' | 'Movements' | 'Low Stock'
const TABS: Tab[] = canAdjust
  ? ['Stock In', 'Adjust', 'Stocktake', 'Movements', 'Low Stock']
  : ['Movements', 'Low Stock']
const tab = ref<Tab>(TABS[0])
</script>

<template>
  <div class="space-y-4">
    <div class="flex gap-1 border-b border-gray-200">
      <button
        v-for="t in TABS"
        :key="t"
        class="border-b-2 px-4 py-2 text-sm font-medium transition-colors duration-100"
        :class="
          tab === t
            ? 'border-accent text-accent'
            : 'border-transparent text-gray-500 hover:text-gray-800'
        "
        @click="tab = t"
      >
        {{ t }}
      </button>
    </div>

    <StockInPanel v-if="tab === 'Stock In'" />
    <AdjustPanel v-else-if="tab === 'Adjust'" />
    <StocktakePanel v-else-if="tab === 'Stocktake'" />
    <MovementsPanel v-else-if="tab === 'Movements'" />
    <LowStockPanel v-else />
  </div>
</template>
