import { defineStore } from 'pinia'
import type {
  PaymentInput,
  PosItem,
  SaleInput,
  SaleReceipt,
  SpecialDiscount,
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
  /** Computed discount for the line (centavos) — what the sale engine reads. */
  lineDiscount: number
  /** UI: whether the typed discount is a peso amount or a percent. */
  discountMode: 'amount' | 'percent'
  /** UI: the raw value the cashier typed (peso amount or percent). */
  discountInput: string
  /** 'vat' (VAT-inclusive) or 'non_vat' — drives senior/PWD VAT exemption. */
  taxType: string
  promoId: number | null
  promoName: string | null
}

interface CartSnapshot {
  lines: CartLine[]
  vouchers: Voucher[]
  discountType: 'none' | 'percent' | 'amount'
  discountValue: number
  special: SpecialDiscount | null
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
    /** Senior/PWD discount (replaces the manual discount when set). */
    special: null as SpecialDiscount | null,
    /** Supervisor creds approving manual discounts when the cashier lacks `discount` (transient). */
    discountApprover: null as { username: string; password: string } | null,
    lastSale: null as SaleReceipt | null
  }),

  getters: {
    isEmpty: (state) => state.lines.length === 0,
    itemCount: (state) => state.lines.reduce((n, l) => n + l.qty, 0),
    subtotal: (state) => state.lines.reduce((n, l) => n + l.price * l.qty, 0),
    lineDiscountTotal: (state) => state.lines.reduce((n, l) => n + l.lineDiscount, 0),

    /** Manual transaction discount — suppressed while a senior/PWD discount is active. */
    txnDiscount(state): number {
      if (state.special) return 0
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

    /** Senior/PWD: a flat 20% discount (VAT still applies, computed normally). */
    specialDiscount(state): number {
      if (!state.special) return 0
      return Math.round((this.subtotal - this.lineDiscountTotal) * 0.2)
    },

    /** Whichever transaction-level discount currently applies. */
    transactionDiscount(): number {
      return this.special ? this.specialDiscount : this.txnDiscount
    },

    voucherDiscount(state): number {
      const base = this.subtotal - this.lineDiscountTotal - this.transactionDiscount
      let acc = 0
      for (const v of state.vouchers) {
        const amount = v.type === 'percent' ? Math.round((base * v.value) / 100) : v.value
        acc += Math.min(Math.max(amount, 0), base - acc)
      }
      return acc
    },

    total(): number {
      return (
        this.subtotal - this.lineDiscountTotal - this.transactionDiscount - this.voucherDiscount
      )
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
        discountMode: 'amount',
        discountInput: '',
        taxType: item.taxType,
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

    setSpecialDiscount(special: SpecialDiscount): void {
      // Senior/PWD replaces any manual discount.
      this.discountType = 'none'
      this.discountValue = 0
      this.special = special
    },

    clearSpecialDiscount(): void {
      this.special = null
    },

    setDiscountApprover(creds: { username: string; password: string }): void {
      this.discountApprover = creds
    },

    removeLine(key: number): void {
      this.lines = this.lines.filter((l) => l.key !== key)
    },

    clear(): void {
      this.lines = []
      this.vouchers = []
      this.discountType = 'none'
      this.discountValue = 0
      this.special = null
      this.discountApprover = null
    },

    snapshot(): string {
      const snap: CartSnapshot = {
        lines: this.lines,
        vouchers: this.vouchers,
        discountType: this.discountType,
        discountValue: this.discountValue,
        special: this.special
      }
      return JSON.stringify(snap)
    },

    restore(payload: string): void {
      const snap = JSON.parse(payload) as CartSnapshot
      this.lines = snap.lines.map((l) => ({
        ...l,
        key: nextKey++,
        discountMode: l.discountMode ?? 'amount',
        discountInput: l.discountInput ?? ''
      }))
      this.vouchers = snap.vouchers
      this.discountType = snap.discountType
      this.discountValue = snap.discountValue
      this.special = snap.special ?? null
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
        discount_value: Math.trunc(this.discountValue),
        // Plain-copy — a reactive Proxy cannot cross the contextBridge.
        special_discount: this.special
          ? { type: this.special.type, name: this.special.name, id: this.special.id }
          : null,
        discount_approver: this.discountApprover
          ? { username: this.discountApprover.username, password: this.discountApprover.password }
          : null,
        voucher_codes: this.vouchers.map((v) => v.code),
        customer_id: customerId,
        payments: payments.map((p) => ({ method: p.method, amount: p.amount }))
      }
      // Final guard: round-trip through JSON to strip any Vue reactivity so the
      // contextBridge can always structured-clone the payload.
      const receipt = await window.api.sales.complete(JSON.parse(JSON.stringify(input)) as SaleInput)
      this.lastSale = receipt
      this.clear()
      return receipt
    }
  }
})
