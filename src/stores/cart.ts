import { defineStore } from 'pinia'
import type {
  PaymentInput,
  PosItem,
  SaleInput,
  SaleReceipt,
  Voucher
} from '../../shared/types'

export interface CartLine {
  key: number
  itemId: number
  sku: string
  name: string
  unit: string
  /** Regular selling price (centavos) — what the price would be without promos. */
  basePrice: number
  /** Unit price charged (centavos): promo price, or an override. */
  price: number
  qty: number
  lineDiscount: number
  promoId: number | null
  promoName: string | null
}

interface CartSnapshot {
  lines: CartLine[]
  vouchers: Voucher[]
  discountType: 'none' | 'percent' | 'amount'
  discountValue: number
}

let nextKey = 1

/**
 * Display-side mirror of the totals; the main process recomputes everything
 * authoritatively in sales:complete — these numbers are never sent as truth.
 */
export const useCartStore = defineStore('cart', {
  state: () => ({
    lines: [] as CartLine[],
    vouchers: [] as Voucher[],
    discountType: 'none' as 'none' | 'percent' | 'amount',
    discountValue: 0,
    lastSale: null as SaleReceipt | null
  }),

  getters: {
    isEmpty: (state) => state.lines.length === 0,
    itemCount: (state) => state.lines.reduce((n, l) => n + l.qty, 0),
    subtotal: (state) => state.lines.reduce((n, l) => n + l.price * l.qty, 0),
    lineDiscountTotal: (state) => state.lines.reduce((n, l) => n + l.lineDiscount, 0),

    txnDiscount(state): number {
      const base = this.subtotal - this.lineDiscountTotal
      if (state.discountType === 'percent') {
        const pct = Math.min(Math.max(Math.trunc(state.discountValue) || 0, 0), 100)
        return Math.round((base * pct) / 100)
      }
      if (state.discountType === 'amount') {
        return Math.min(Math.max(Math.trunc(state.discountValue) || 0, 0), base)
      }
      return 0
    },

    voucherDiscount(state): number {
      const base = this.subtotal - this.lineDiscountTotal - this.txnDiscount
      let acc = 0
      for (const v of state.vouchers) {
        const amount = v.type === 'percent' ? Math.round((base * v.value) / 100) : v.value
        acc += Math.min(Math.max(amount, 0), base - acc)
      }
      return acc
    },

    total(): number {
      return this.subtotal - this.lineDiscountTotal - this.txnDiscount - this.voucherDiscount
    }
  },

  actions: {
    addItem(item: PosItem): void {
      // Merge with an existing un-tweaked line of the same item.
      const existing = this.lines.find(
        (l) =>
          l.itemId === item.itemId && l.price === item.effectivePrice && l.lineDiscount === 0
      )
      if (existing) {
        existing.qty += 1
        return
      }
      this.lines.push({
        key: nextKey++,
        itemId: item.itemId,
        sku: item.sku,
        name: item.name,
        unit: item.unit,
        basePrice: item.sellPrice,
        price: item.effectivePrice,
        qty: 1,
        lineDiscount: 0,
        promoId: item.promoId,
        promoName: item.promoName
      })
    },

    addVoucher(voucher: Voucher): boolean {
      if (this.vouchers.some((v) => v.id === voucher.id)) return false
      this.vouchers.push(voucher)
      return true
    },

    removeVoucher(id: number): void {
      this.vouchers = this.vouchers.filter((v) => v.id !== id)
    },

    removeLine(key: number): void {
      this.lines = this.lines.filter((l) => l.key !== key)
    },

    clear(): void {
      this.lines = []
      this.vouchers = []
      this.discountType = 'none'
      this.discountValue = 0
    },

    snapshot(): string {
      const snap: CartSnapshot = {
        lines: this.lines,
        vouchers: this.vouchers,
        discountType: this.discountType,
        discountValue: this.discountValue
      }
      return JSON.stringify(snap)
    },

    restore(payload: string): void {
      const snap = JSON.parse(payload) as CartSnapshot
      this.lines = snap.lines.map((l) => ({ ...l, key: nextKey++ }))
      this.vouchers = snap.vouchers
      this.discountType = snap.discountType
      this.discountValue = snap.discountValue
    },

    async complete(payments: PaymentInput[], customerId: number | null): Promise<SaleReceipt> {
      const input: SaleInput = {
        lines: this.lines.map((l) => ({
          item_id: l.itemId,
          qty: l.qty,
          price: l.price,
          line_discount: l.lineDiscount
        })),
        discount_type: this.discountType,
        discount_value:
          this.discountType === 'percent' ? Math.trunc(this.discountValue) : Math.trunc(this.discountValue),
        voucher_codes: this.vouchers.map((v) => v.code),
        customer_id: customerId,
        payments: payments.map((p) => ({ method: p.method, amount: p.amount }))
      }
      const receipt = await window.api.sales.complete(input)
      this.lastSale = receipt
      this.clear()
      return receipt
    }
  }
})
