import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

// Hash history: works identically under the dev server and file:// in production.
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/Login.vue'),
      meta: { public: true }
    },
    {
      path: '/',
      component: () => import('@/components/layout/AppShell.vue'),
      children: [
        { path: '', redirect: '/pos' },
        {
          path: 'pos',
          component: () => import('@/views/Pos.vue'),
          meta: { menu: 'pos', title: 'Point of Sale' }
        },
        {
          path: 'items',
          component: () => import('@/views/Items.vue'),
          meta: { menu: 'items', title: 'Items' }
        },
        {
          path: 'customers',
          component: () => import('@/views/Customers.vue'),
          meta: { menu: 'customers', title: 'Customers' }
        },
        {
          path: 'inventory',
          component: () => import('@/views/Inventory.vue'),
          meta: { menu: 'inventory', title: 'Inventory' }
        },
        {
          path: 'ledger',
          component: () => import('@/views/Ledger.vue'),
          meta: { menu: 'ledger', title: 'Customer Ledger' }
        },
        {
          path: 'reports',
          component: () => import('@/views/Reports.vue'),
          meta: { menu: 'reports', title: 'Reports' }
        },
        {
          path: 'settings',
          component: () => import('@/views/Settings.vue'),
          meta: { menu: 'settings', title: 'Settings' }
        }
      ]
    },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.restore()

  if (to.meta.public) {
    return auth.isAuthenticated ? { path: '/' } : true
  }

  if (!auth.isAuthenticated) {
    return { name: 'login' }
  }

  // Menu visibility is the router-level gate; IPC handlers enforce the real permissions.
  const menu = to.meta.menu as string | undefined
  if (menu && !auth.hasMenu(menu)) {
    const firstAllowed = auth.session!.menus[0]
    return firstAllowed ? { path: `/${firstAllowed}` } : { name: 'login' }
  }

  return true
})

export default router
