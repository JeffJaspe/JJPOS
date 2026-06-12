<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import PaymentModal from '@/components/pos/PaymentModal.vue'
import HeldSalesModal from '@/components/pos/HeldSalesModal.vue'
import VoidSaleModal from '@/components/pos/VoidSaleModal.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import { useCartStore } from '@/stores/cart'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import { useToast } from '@/composables/useToast'
import { usePermissions } from '@/composables/usePermissions'
import { centavosToInput, formatPeso, pesosToCentavos } from '@/utils/money'
import { buildReceiptHtml } from '@/utils/receipt'
import type { PaymentInput, PosItem } from '../../shared/types'

const cart = useCartStore()
const settings = useSettingsStore()
const toast = useToast()
const { can } = usePermissions()

// -- Scan / search -----------------------------------------------------------

const scanInput = ref<HTMLInputElement | null>(null)
const term = ref('')
const results = ref<PosItem[]>([])
const busyScan = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | undefined

async function submitScan(): Promise<void> {
  const code = term.value.trim()
  if (!code || busyScan.value) return
  busyScan.value = true
  try {
    const hit = await window.api.pos.scan(code)
    if (hit.kind === 'item') {
      cart.addItem(hit.item)
      clearSearch()
    } else if (hit.kind === 'voucher') {
      if (cart.addVoucher(hit.voucher)) toast.success(`Voucher applied: ${hit.voucher.code}`)
      else toast.info('That voucher is already in this sale')
      clearSearch()
    } else {
      // Not a barcode — fall back to name/SKU search.
      results.value = await window.api.pos.search(code)
      if (results.value.length === 1) {
        cart.addItem(results.value[0])
        clearSearch()
      } else if (results.value.length === 0) {
        toast.error(`No item or voucher matches “${code}”`)
      }
    }
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Scan failed')
    clearSearch()
  } finally {
    busyScan.value = false
    scanInput.value?.focus()
  }
}

function onTermInput(): void {
  clearTimeout(searchTimer)
  const q = term.value.trim()
  if (q.length < 2) {
    results.value = []
    return
  }
  searchTimer = setTimeout(async () => {
    results.value = await window.api.pos.search(q)
  }, 250)
}

function pickResult(item: PosItem): void {
  cart.addItem(item)
  clearSearch()
  scanInput.value?.focus()
}

function clearSearch(): void {
  term.value = ''
  results.value = []
}

// -- Line editing --------------------------------------------------------------

const canOverride = can('price_override')

function setQty(key: number, value: number): void {
  const line = cart.lines.find((l) => l.key === key)
  if (!line) return
  const qty = Math.trunc(value)
  if (qty < 1) cart.removeLine(key)
  else line.qty = qty
}

const priceEditKey = ref<number | null>(null)
const priceEditValue = ref('')

function startPriceEdit(key: number): void {
  if (!canOverride) return
  const line = cart.lines.find((l) => l.key === key)
  if (!line) return
  priceEditKey.value = key
  priceEditValue.value = centavosToInput(line.price)
}

function applyPriceEdit(): void {
  const line = cart.lines.find((l) => l.key === priceEditKey.value)
  if (line) {
    const price = pesosToCentavos(priceEditValue.value)
    if (price >= 0) {
      line.price = price
      line.promoId = null
      line.promoName = null
    }
  }
  priceEditKey.value = null
}

// -- Discounts ------------------------------------------------------------------

const discountInput = ref('')
function applyDiscount(): void {
  const raw = discountInput.value.trim()
  if (!raw) {
    cart.discountType = 'none'
    cart.discountValue = 0
    return
  }
  if (raw.endsWith('%')) {
    cart.discountType = 'percent'
    cart.discountValue = Math.trunc(Number.parseFloat(raw) || 0)
  } else {
    cart.discountType = 'amount'
    cart.discountValue = pesosToCentavos(raw)
  }
}

// -- Payment / completion ---------------------------------------------------------

const paymentOpen = ref(false)
const paymentModal = ref<InstanceType<typeof PaymentModal> | null>(null)
const changeOverlay = ref<{ change: number; total: number } | null>(null)

function openPayment(): void {
  if (cart.isEmpty) {
    toast.info('Cart is empty — scan an item first')
    return
  }
  paymentOpen.value = true
}

async function onConfirmPayment(payments: PaymentInput[], customerId: number | null): Promise<void> {
  try {
    const receipt = await cart.complete(payments, customerId)
    paymentOpen.value = false
    changeOverlay.value = { change: receipt.change, total: receipt.total }
    printReceipt(false)
  } catch (err) {
    paymentModal.value?.stopBusy()
    toast.error(err instanceof Error ? err.message : 'Sale failed')
  }
}

async function printReceipt(reprint: boolean): Promise<void> {
  const sale = cart.lastSale
  if (!sale) {
    toast.info('No sale to reprint yet')
    return
  }
  if (!reprint && settings.app.receipt_auto_print === '0') return
  try {
    await window.api.print.receipt(buildReceiptHtml(sale, settings.app, settings.branding))
    if (reprint) toast.success(`Reprinted ${sale.sale_no}`)
  } catch (err) {
    toast.error(err instanceof Error ? `Receipt: ${err.message}` : 'Receipt print failed')
  }
}

function dismissOverlay(): void {
  changeOverlay.value = null
  scanInput.value?.focus()
}

// -- Hold / recall / void -----------------------------------------------------------

const holdOpen = ref(false)
const holdLabel = ref('')
const heldOpen = ref(false)
const voidOpen = ref(false)

async function confirmHold(): Promise<void> {
  if (cart.isEmpty) return
  await window.api.sales.hold(holdLabel.value, cart.snapshot())
  cart.clear()
  holdOpen.value = false
  holdLabel.value = ''
  toast.success('Sale held')
  scanInput.value?.focus()
}

function onRecalled(payload: string): void {
  if (!cart.isEmpty) {
    toast.error('Finish or hold the current sale before recalling')
    return
  }
  cart.restore(payload)
  heldOpen.value = false
  scanInput.value?.focus()
}

// -- Fullscreen & keyboard ------------------------------------------------------------
// Fullscreen goes on documentElement (not the POS element) so body-teleported
// modals and toasts keep rendering; the shell hides its chrome via ui.kiosk.

const ui = useUiStore()
const isFullscreen = ref(false)

function toggleFullscreen(): void {
  if (document.fullscreenElement) document.exitFullscreen()
  else document.documentElement.requestFullscreen()
}

function onFullscreenChange(): void {
  isFullscreen.value = document.fullscreenElement !== null
  ui.kiosk = isFullscreen.value
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'F9') {
    event.preventDefault()
    openPayment()
  } else if (event.key === 'F10') {
    event.preventDefault()
    if (!cart.isEmpty) holdOpen.value = true
  } else if (event.key === 'F11') {
    event.preventDefault()
    toggleFullscreen()
  }
}

onMounted(() => {
  document.addEventListener('fullscreenchange', onFullscreenChange)
  window.addEventListener('keydown', onKeydown)
  settings.loadAppSettings()
  scanInput.value?.focus()
})

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  window.removeEventListener('keydown', onKeydown)
  // Leaving the POS while in kiosk mode: restore the shell chrome.
  if (document.fullscreenElement) document.exitFullscreen()
  ui.kiosk = false
})

/** Scale the giant figures down as the amount grows so they never clip. */
const totalClass = computed(() => {
  const len = formatPeso(cart.total).length
  if (isFullscreen.value) {
    if (len <= 7) return 'text-[7.5rem] leading-none'
    if (len <= 9) return 'text-[6rem] leading-none'
    if (len <= 11) return 'text-[4.75rem] leading-none'
    return 'text-[3.75rem] leading-none'
  }
  if (len <= 7) return 'text-6xl'
  if (len <= 9) return 'text-5xl'
  if (len <= 11) return 'text-4xl'
  return 'text-3xl'
})

const changeClass = computed(() => {
  if (!changeOverlay.value) return ''
  const len = formatPeso(changeOverlay.value.change).length
  if (len <= 7) return 'text-[12rem]'
  if (len <= 9) return 'text-[9.5rem]'
  if (len <= 12) return 'text-[7.5rem]'
  return 'text-[5.5rem]'
})
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-3 bg-gray-100">
    <!-- Fullscreen mini header -->
    <div v-if="isFullscreen" class="flex items-center justify-between">
      <span class="text-lg font-semibold text-gray-700">{{ settings.branding.app_name }} — Point of Sale</span>
      <button class="btn-secondary px-3 py-1.5 text-xs" @click="toggleFullscreen">
        Exit fullscreen (F11)
      </button>
    </div>

    <div class="flex min-h-0 flex-1 gap-4">
      <!-- Left: scan + cart -->
      <div class="flex min-w-0 flex-1 flex-col gap-3">
        <div class="relative">
          <input
            ref="scanInput"
            v-model="term"
            type="text"
            placeholder="Scan barcode / voucher, or type to search…  (Enter)"
            class="input py-3 text-lg"
            @keydown.enter.prevent="submitScan"
            @input="onTermInput"
            @keydown.esc="clearSearch"
          />
          <!-- Search results dropdown -->
          <div
            v-if="results.length"
            class="absolute top-full right-0 left-0 z-10 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
          >
            <button
              v-for="r in results"
              :key="r.itemId"
              class="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors duration-100 hover:bg-gray-50"
              @click="pickResult(r)"
            >
              <span>
                <span class="font-medium text-gray-900">{{ r.name }}</span>
                <span class="ml-2 font-mono text-xs text-gray-400">{{ r.sku }}</span>
                <span v-if="r.promoName" class="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                  {{ r.promoName }}
                </span>
              </span>
              <span class="tabular-nums">
                <span v-if="r.promoId" class="mr-1 text-xs text-gray-400 line-through">
                  {{ formatPeso(r.sellPrice) }}
                </span>
                <span class="font-semibold">{{ formatPeso(r.effectivePrice) }}</span>
              </span>
            </button>
          </div>
        </div>

        <!-- Cart -->
        <div class="min-h-0 flex-1 overflow-y-auto rounded-lg border border-gray-200 bg-white">
          <table class="w-full text-sm">
            <thead class="sticky top-0 bg-gray-50 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
              <tr>
                <th class="px-3 py-2.5">Item</th>
                <th class="w-24 px-3 py-2.5 text-center">Qty</th>
                <th class="w-28 px-3 py-2.5 text-right">Price</th>
                <th class="w-28 px-3 py-2.5 text-right">Less</th>
                <th class="w-28 px-3 py-2.5 text-right">Total</th>
                <th class="w-10 px-3 py-2.5"></th>
              </tr>
            </thead>
            <TransitionGroup name="rows" tag="tbody" class="divide-y divide-gray-100">
              <tr v-for="line in cart.lines" :key="line.key">
                <td class="px-3 py-2">
                  <p class="font-medium text-gray-900">{{ line.name }}</p>
                  <p class="text-xs text-gray-400">
                    {{ line.sku }}
                    <span v-if="line.promoName" class="ml-1 rounded bg-green-100 px-1.5 py-0.5 text-green-700">
                      {{ line.promoName }}
                    </span>
                    <span v-else-if="line.price !== line.basePrice" class="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">
                      override
                    </span>
                  </p>
                </td>
                <td class="px-3 py-2 text-center">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    :value="line.qty"
                    class="input w-20 px-2 py-1 text-center"
                    @change="setQty(line.key, Number(($event.target as HTMLInputElement).value))"
                  />
                </td>
                <td class="px-3 py-2 text-right tabular-nums">
                  <template v-if="priceEditKey === line.key">
                    <input
                      v-model="priceEditValue"
                      type="number"
                      min="0"
                      step="0.01"
                      class="input w-24 px-2 py-1 text-right"
                      @keydown.enter.prevent="applyPriceEdit"
                      @blur="applyPriceEdit"
                    />
                  </template>
                  <button
                    v-else
                    class="rounded px-1 tabular-nums"
                    :class="canOverride ? 'hover:bg-gray-100' : 'cursor-default'"
                    :title="canOverride ? 'Click to override price' : undefined"
                    @click="startPriceEdit(line.key)"
                  >
                    {{ formatPeso(line.price) }}
                  </button>
                </td>
                <td class="px-3 py-2 text-right">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    :value="line.lineDiscount ? centavosToInput(line.lineDiscount) : ''"
                    placeholder="0.00"
                    class="input w-24 px-2 py-1 text-right"
                    @change="line.lineDiscount = pesosToCentavos(($event.target as HTMLInputElement).value)"
                  />
                </td>
                <td class="px-3 py-2 text-right font-semibold tabular-nums">
                  {{ formatPeso(line.price * line.qty - line.lineDiscount) }}
                </td>
                <td class="px-3 py-2 text-center">
                  <button
                    class="text-gray-300 transition-colors duration-100 hover:text-red-600"
                    :aria-label="`Remove ${line.name}`"
                    @click="cart.removeLine(line.key)"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            </TransitionGroup>
          </table>
          <p v-if="cart.isEmpty" class="py-16 text-center text-sm text-gray-400">
            Scan an item to start a sale.
          </p>
        </div>
      </div>

      <!-- Right: totals & actions -->
      <div class="flex shrink-0 flex-col gap-3" :class="isFullscreen ? 'w-[32rem]' : 'w-96'">
        <!-- Giant total -->
        <div class="rounded-lg bg-gray-900 px-4 py-5 text-center">
          <p class="text-xs font-medium tracking-widest text-gray-400 uppercase">Total</p>
          <p class="font-bold text-white tabular-nums" :class="totalClass">
            {{ formatPeso(cart.total) }}
          </p>
          <p class="mt-1 text-sm text-gray-400">{{ cart.itemCount }} item(s)</p>
        </div>

        <div class="space-y-1.5 rounded-lg border border-gray-200 bg-white p-3 text-sm">
          <div class="flex justify-between text-gray-600">
            <span>Subtotal</span><span class="tabular-nums">{{ formatPeso(cart.subtotal) }}</span>
          </div>
          <div v-if="cart.lineDiscountTotal" class="flex justify-between text-gray-600">
            <span>Line discounts</span>
            <span class="tabular-nums">-{{ formatPeso(cart.lineDiscountTotal) }}</span>
          </div>
          <div class="flex items-center justify-between gap-2 text-gray-600">
            <span>Discount</span>
            <input
              v-model="discountInput"
              type="text"
              placeholder="e.g. 10% or 50"
              class="input w-28 px-2 py-1 text-right text-xs"
              @change="applyDiscount"
              @keydown.enter.prevent="applyDiscount"
            />
            <span class="w-20 text-right tabular-nums">-{{ formatPeso(cart.txnDiscount) }}</span>
          </div>
          <div v-if="cart.vouchers.length" class="space-y-1 border-t border-gray-100 pt-1.5">
            <div
              v-for="v in cart.vouchers"
              :key="v.id"
              class="flex items-center justify-between gap-2 text-green-700"
            >
              <span class="font-mono text-xs">{{ v.code }}</span>
              <span class="ml-auto tabular-nums">
                -{{ v.type === 'percent' ? v.value + '%' : formatPeso(v.value) }}
              </span>
              <button
                class="text-gray-300 transition-colors duration-100 hover:text-red-600"
                aria-label="Remove voucher"
                @click="cart.removeVoucher(v.id)"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <button class="btn-primary py-4 text-xl" :disabled="cart.isEmpty" @click="openPayment">
          Pay (F9)
        </button>
        <div class="grid grid-cols-2 gap-2">
          <button class="btn-secondary" :disabled="cart.isEmpty" @click="holdOpen = true">
            Hold (F10)
          </button>
          <button class="btn-secondary" @click="heldOpen = true">Recall</button>
          <button class="btn-secondary" @click="voidOpen = true">Void Sale</button>
          <button class="btn-secondary" @click="printReceipt(true)">Reprint Last</button>
        </div>
        <button
          class="btn-secondary flex items-center justify-center gap-2"
          @click="toggleFullscreen"
        >
          <AppIcon name="menu" class="h-4 w-4" />
          {{ isFullscreen ? 'Exit Fullscreen' : 'Fullscreen' }} (F11)
        </button>
      </div>
    </div>

    <!-- Change overlay: 2-meters readable -->
    <Transition name="modal">
      <div
        v-if="changeOverlay"
        class="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center bg-gray-900/95"
        @click="dismissOverlay"
      >
        <p class="text-3xl font-medium tracking-widest text-gray-400 uppercase">Change</p>
        <p class="leading-none font-bold text-white tabular-nums" :class="changeClass">
          {{ formatPeso(changeOverlay.change) }}
        </p>
        <p class="mt-6 text-2xl text-gray-400">
          Total paid: {{ formatPeso(changeOverlay.total) }} — click anywhere for next sale
        </p>
      </div>
    </Transition>

    <!-- Hold label modal -->
    <AppModal :open="holdOpen" title="Hold Sale" @close="holdOpen = false">
      <label class="mb-1 block text-sm font-medium text-gray-700">Label (optional)</label>
      <input
        v-model="holdLabel"
        type="text"
        placeholder="e.g. Customer in blue shirt"
        class="input"
        @keydown.enter.prevent="confirmHold"
      />
      <template #footer>
        <div class="flex justify-end gap-2">
          <button class="btn-secondary" @click="holdOpen = false">Cancel</button>
          <button class="btn-primary" @click="confirmHold">Hold</button>
        </div>
      </template>
    </AppModal>

    <PaymentModal
      ref="paymentModal"
      :open="paymentOpen"
      :total="cart.total"
      @close="paymentOpen = false"
      @confirm="onConfirmPayment"
    />
    <HeldSalesModal :open="heldOpen" @close="heldOpen = false" @recalled="onRecalled" />
    <VoidSaleModal :open="voidOpen" @close="voidOpen = false" @voided="() => {}" />
  </div>
</template>
