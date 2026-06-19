<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useCartStore } from '@/stores/cart'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import { useCartPersistence } from '@/composables/useCartPersistence'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppModal from '@/components/ui/AppModal.vue'
import BrandLogo from '@/components/ui/BrandLogo.vue'

interface MenuItem {
  key: string
  label: string
  to: string
  icon: string
}

const MENU_ITEMS: MenuItem[] = [
  { key: 'pos', label: 'Point of Sale', to: '/pos', icon: 'shopping-cart' },
  { key: 'items', label: 'Items', to: '/items', icon: 'cube' },
  { key: 'customers', label: 'Customers', to: '/customers', icon: 'users' },
  { key: 'inventory', label: 'Inventory', to: '/inventory', icon: 'archive-box' },
  { key: 'ledger', label: 'Ledger', to: '/ledger', icon: 'book-open' },
  { key: 'reports', label: 'Reports', to: '/reports', icon: 'chart-bar' },
  { key: 'settings', label: 'Settings', to: '/settings', icon: 'cog' }
]

const auth = useAuthStore()
const cart = useCartStore()
const settings = useSettingsStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()

// Cart crash-recovery + autosave (login-scoped: this shell only mounts when authenticated).
const { recoveryDraft, recoverDraft, discardDraft, dismissRecovery, start } = useCartPersistence()
onMounted(() => start())

function savedAtLabel(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString()
}

const collapsed = ref(localStorage.getItem('sidebar:collapsed') === '1')
function toggleSidebar(): void {
  collapsed.value = !collapsed.value
  localStorage.setItem('sidebar:collapsed', collapsed.value ? '1' : '0')
}

const visibleMenus = computed(() => MENU_ITEMS.filter((m) => auth.hasMenu(m.key)))
const pageTitle = computed(() => (route.meta.title as string) ?? '')

const logoutConfirmOpen = ref(false)

function requestLogout(): void {
  // Remind the cashier an unfinished sale will be cleared (graceful logout
  // discards the draft, so it won't be offered back next login).
  if (!cart.isEmpty) {
    logoutConfirmOpen.value = true
    return
  }
  void doLogout()
}

async function doLogout(): Promise<void> {
  logoutConfirmOpen.value = false
  // Graceful exit: drop the draft so the next login isn't offered a stale cart.
  await window.api.cartDraft.clear().catch(() => {})
  await auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-gray-100 text-gray-900">
    <!-- Sidebar (hidden in POS kiosk fullscreen) -->
    <aside
      v-show="!ui.kiosk"
      class="flex flex-col text-gray-300 transition-all duration-200 ease-in-out"
      :class="collapsed ? 'w-16' : 'w-60'"
      :style="{ backgroundColor: 'var(--sidebar)' }"
    >
      <div class="flex h-14 items-center gap-3 px-4">
        <BrandLogo size-class="h-6 w-6" />
        <span
          class="truncate text-base font-semibold whitespace-nowrap text-white transition-opacity duration-200"
          :class="collapsed ? 'opacity-0' : 'opacity-100'"
        >
          {{ settings.branding.app_name }}
        </span>
      </div>

      <nav class="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        <RouterLink
          v-for="item in visibleMenus"
          :key="item.key"
          :to="item.to"
          class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-100 active:scale-[0.98]"
          :class="
            route.path.startsWith(item.to)
              ? 'bg-accent text-white'
              : 'hover:bg-gray-800 hover:text-white'
          "
          :title="collapsed ? item.label : undefined"
        >
          <AppIcon :name="item.icon" />
          <span
            class="truncate whitespace-nowrap transition-opacity duration-200"
            :class="collapsed ? 'opacity-0' : 'opacity-100'"
          >
            {{ item.label }}
          </span>
        </RouterLink>
      </nav>

      <div class="border-t border-gray-800 p-2">
        <button
          class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-100 hover:bg-gray-800 hover:text-white active:scale-[0.98]"
          :title="collapsed ? 'Sign out' : undefined"
          @click="requestLogout"
        >
          <AppIcon name="logout" />
          <span
            class="truncate whitespace-nowrap transition-opacity duration-200"
            :class="collapsed ? 'opacity-0' : 'opacity-100'"
          >
            Sign out
          </span>
        </button>
      </div>
    </aside>

    <!-- Main column -->
    <div class="flex min-w-0 flex-1 flex-col">
      <header
        v-show="!ui.kiosk"
        class="flex h-14 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4"
      >
        <button
          class="rounded-md p-2 text-gray-600 transition-transform duration-100 hover:bg-gray-100 active:scale-[0.98]"
          aria-label="Toggle sidebar"
          @click="toggleSidebar"
        >
          <AppIcon name="menu" />
        </button>
        <h1 class="text-lg font-semibold">{{ settings.branding.app_name }}</h1>
        <span class="text-gray-300">/</span>
        <span class="text-base text-gray-500">{{ pageTitle }}</span>

        <div class="ml-auto flex items-center gap-2 text-sm">
          <span class="font-medium">{{ auth.session?.fullName || auth.session?.username }}</span>
          <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            {{ auth.session?.roleName }}
          </span>
        </div>
      </header>

      <main
        class="flex min-h-0 flex-1 flex-col overflow-y-auto"
        :class="ui.kiosk ? 'p-4' : 'p-6'"
      >
        <RouterView v-slot="{ Component }">
          <Transition name="page" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </main>
    </div>

    <!-- Crash recovery: offer the owning cashier their unfinished sale -->
    <AppModal
      :open="recoveryDraft !== null"
      title="Unfinished sale found"
      @close="dismissRecovery"
    >
      <p class="text-sm text-gray-600">
        A sale was in progress when the app last closed unexpectedly. Recover it to
        continue, or discard to start fresh.
      </p>
      <p v-if="recoveryDraft" class="mt-2 text-xs text-gray-400">
        Saved {{ savedAtLabel(recoveryDraft.savedAt) }} · {{ recoveryDraft.userName }}
      </p>
      <template #footer>
        <div class="flex justify-end gap-2">
          <button class="btn-secondary" @click="discardDraft">Discard</button>
          <button class="btn-primary" @click="recoverDraft">Recover</button>
        </div>
      </template>
    </AppModal>

    <!-- Logout reminder: a non-empty cart will be cleared -->
    <AppModal
      :open="logoutConfirmOpen"
      title="Sign out?"
      @close="logoutConfirmOpen = false"
    >
      <p class="text-sm text-gray-600">
        You have an unfinished sale in the cart. Signing out will
        <span class="font-medium text-gray-900">clear it</span> — this can't be recovered.
        Hold the sale first if you want to keep it.
      </p>
      <template #footer>
        <div class="flex justify-end gap-2">
          <button class="btn-secondary" @click="logoutConfirmOpen = false">Cancel</button>
          <button class="btn-primary" @click="doLogout">Sign out &amp; clear</button>
        </div>
      </template>
    </AppModal>
  </div>
</template>
