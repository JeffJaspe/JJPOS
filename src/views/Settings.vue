<script setup lang="ts">
import { ref } from 'vue'
import UsersPanel from '@/components/settings/UsersPanel.vue'
import RolesPanel from '@/components/settings/RolesPanel.vue'
import BrandingPanel from '@/components/settings/BrandingPanel.vue'
import StoreSettingsPanel from '@/components/settings/StoreSettingsPanel.vue'
import ReceiptDesignerPanel from '@/components/settings/ReceiptDesignerPanel.vue'
import PaymentsPanel from '@/components/settings/PaymentsPanel.vue'
import PlaceholderView from '@/components/ui/PlaceholderView.vue'
import { usePermissions } from '@/composables/usePermissions'
import { useAuthStore } from '@/stores/auth'

const { can } = usePermissions()
const auth = useAuthStore()

type Tab = 'Users' | 'Roles' | 'Branding' | 'Store' | 'Payments' | 'Receipt'
const TABS: Tab[] = []
if (can('manage_users')) TABS.push('Users')
if (auth.session?.isSuperAdmin) TABS.push('Roles')
if (can('manage_branding')) TABS.push('Branding')
if (can('manage_settings')) TABS.push('Store')
if (can('manage_settings')) TABS.push('Payments')
if (can('manage_settings')) TABS.push('Receipt')

const tab = ref<Tab | null>(TABS[0] ?? null)
</script>

<template>
  <div class="space-y-4">
    <template v-if="tab">
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

      <UsersPanel v-if="tab === 'Users'" />
      <RolesPanel v-else-if="tab === 'Roles'" />
      <BrandingPanel v-else-if="tab === 'Branding'" />
      <StoreSettingsPanel v-else-if="tab === 'Store'" />
      <PaymentsPanel v-else-if="tab === 'Payments'" />
      <ReceiptDesignerPanel v-else-if="tab === 'Receipt'" />
    </template>

    <PlaceholderView
      v-else
      title="Settings"
      note="Branding, backup, and store settings land later in Phase 6."
    />
  </div>
</template>
