import type Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { getDb } from '../db'
import { handle } from './handle'
import { requireAuth, requirePermission } from './session'
import type {
  HeldSale,
  PosItem,
  PosScanResult,
  RecentSale,
  SaleInput,
  SaleReceipt,
  SaleReceiptLine,
  VoidSaleInput,
  Voucher
} from '../../shared/types'

interface ItemRow {
  id: number
  sku: string
  name: string
  unit: string
  sell_price: number
  cost_price: number
  tax_type: string
  qty_on_hand: number
  active: number
}

function nowUtc(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function getSetting(db: Database.Database, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value
}

function bumpSequence(db: Database.Database, key: string): number {
  const next = Number(getSetting(db, key) ?? 0) + 1
  db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(String(next), key)
  return next
}

function audit(db: Database.Database, userId: number, action: string, detail: string): void {
  db.prepare('INSERT INTO audit_log (user_id, action, detail) VALUES (?, ?, ?)').run(
    userId,
    action,
    detail
  )
}

/**
 * Resolve the best active promo for an item: lowest resulting price wins.
 * Promos never raise the price above the regular one.
 */
export function effectivePrice(
  db: Database.Database,
  itemId: number,
  sellPrice: number
): { price: number; promoId: number | null; promoName: string | null } {
  const promos = db
    .prepare(
      `SELECT p.id, p.name, p.type, p.value
       FROM promos p
       JOIN promo_items pi ON pi.promo_id = p.id
       WHERE pi.item_id = ? AND p.active = 1
         AND (p.starts_at IS NULL OR p.starts_at <= datetime('now'))
         AND (p.ends_at IS NULL OR p.ends_at >= datetime('now'))`
    )
    .all(itemId) as { id: number; name: string; type: string; value: number }[]

  let best = { price: sellPrice, promoId: null as number | null, promoName: null as string | null }
  for (const p of promos) {
    let candidate: number
    if (p.type === 'percent') candidate = Math.round((sellPrice * (100 - p.value)) / 100)
    else if (p.type === 'amount') candidate = sellPrice - p.value
    else candidate = p.value // fixed_price
    candidate = Math.max(candidate, 0)
    if (candidate < best.price) best = { price: candidate, promoId: p.id, promoName: p.name }
  }
  return best
}

function toPosItem(db: Database.Database, item: ItemRow): PosItem {
  const eff = effectivePrice(db, item.id, item.sell_price)
  return {
    itemId: item.id,
    sku: item.sku,
    name: item.name,
    unit: item.unit,
    sellPrice: item.sell_price,
    effectivePrice: eff.price,
    promoId: eff.promoId,
    promoName: eff.promoName,
    qtyOnHand: item.qty_on_hand,
    taxType: item.tax_type
  }
}

function loadReceipt(db: Database.Database, saleId: number): SaleReceipt {
  const sale = db
    .prepare(
      `SELECT s.*, c.name AS customer_name, u.full_name AS cashier_full, u.username AS cashier_user
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`
    )
    .get(saleId) as Record<string, unknown> | undefined
  if (!sale) throw new Error('Sale not found')

  const lines = db
    .prepare(
      `SELECT i.name, si.qty, i.unit, si.price, si.line_discount, si.line_total, p.name AS promo_name
       FROM sale_items si
       JOIN items i ON i.id = si.item_id
       LEFT JOIN promos p ON p.id = si.promo_id
       WHERE si.sale_id = ? ORDER BY si.id`
    )
    .all(saleId) as SaleReceiptLine[]

  const payments = db
    .prepare('SELECT method, amount FROM payments WHERE sale_id = ? ORDER BY id')
    .all(saleId) as { method: never; amount: number }[]

  return {
    id: sale.id as number,
    sale_no: sale.sale_no as string,
    datetime: sale.datetime as string,
    subtotal: sale.subtotal as number,
    discount: sale.discount as number,
    voucher_discount: sale.voucher_discount as number,
    tax: sale.tax as number,
    total: sale.total as number,
    amount_paid: sale.amount_paid as number,
    change: sale.change as number,
    payment_type: sale.payment_type as string,
    status: sale.status as string,
    customer_name: (sale.customer_name as string | null) ?? null,
    cashier: (sale.cashier_full as string) || (sale.cashier_user as string),
    sd_type: (sale.sd_type as string) ?? '',
    sd_name: (sale.sd_name as string) ?? '',
    sd_id: (sale.sd_id as string) ?? '',
    lines,
    payments
  }
}

export function registerSalesHandlers(): void {
  // -- POS lookups -----------------------------------------------------------

  handle<string, PosScanResult>('pos:scan', (code) => {
    requireAuth()
    const db = getDb()
    const term = (code ?? '').trim()
    if (!term) return { kind: 'none' }

    const item = db
      .prepare(
        `SELECT i.* FROM items i
         JOIN item_barcodes b ON b.item_id = i.id
         WHERE b.barcode = ? AND i.active = 1`
      )
      .get(term) as ItemRow | undefined
    if (item) return { kind: 'item', item: toPosItem(db, item) }

    const voucher = db.prepare('SELECT * FROM vouchers WHERE code = ?').get(term) as
      | Voucher
      | undefined
    if (voucher) {
      if (voucher.status !== 'active') throw new Error(`Voucher ${term} is already ${voucher.status}`)
      if (voucher.expires_at && voucher.expires_at < nowUtc()) throw new Error('Voucher has expired')
      return { kind: 'voucher', voucher }
    }
    return { kind: 'none' }
  })

  handle<string, PosItem[]>('pos:search', (term) => {
    requireAuth()
    const db = getDb()
    const q = (term ?? '').trim()
    if (!q) return []
    const rows = db
      .prepare(
        `SELECT * FROM items WHERE active = 1 AND (name LIKE ? OR sku LIKE ?)
         ORDER BY name COLLATE NOCASE LIMIT 10`
      )
      .all(`%${q}%`, `%${q}%`) as ItemRow[]
    return rows.map((r) => toPosItem(db, r))
  })

  // -- Complete a sale ---------------------------------------------------------

  handle<SaleInput, SaleReceipt>('sales:complete', (input) => {
    const user = requirePermission('sell')
    const db = getDb()
    if (!input.lines?.length) throw new Error('Cart is empty')
    if (!input.payments?.length) throw new Error('No payment given')
    if (user.permissions.includes('require_customer') && !input.customer_id) {
      throw new Error('A customer is required for every sale on this account')
    }

    const saleId = db.transaction(() => {
      let subtotal = 0
      let lineDiscTotal = 0
      let vatable = 0
      const overrides: string[] = []
      const preparedLines: {
        item: ItemRow
        qty: number
        price: number
        lineDiscount: number
        lineTotal: number
        promoId: number | null
      }[] = []

      for (const line of input.lines) {
        const item = db
          .prepare('SELECT * FROM items WHERE id = ? AND active = 1')
          .get(line.item_id) as ItemRow | undefined
        if (!item) throw new Error('Item not found or inactive')
        if (!Number.isInteger(line.qty) || line.qty < 1) {
          throw new Error(`Invalid quantity for ${item.name}`)
        }
        if (!Number.isInteger(line.price) || line.price < 0) {
          throw new Error(`Invalid price for ${item.name}`)
        }

        // Promo-or-override rule: the price must match the server-computed
        // effective price unless the cashier holds price_override.
        const eff = effectivePrice(db, item.id, item.sell_price)
        let promoId: number | null = null
        if (line.price === eff.price) {
          promoId = eff.promoId
        } else {
          if (!user.permissions.includes('price_override')) {
            throw new Error(`Price override on ${item.name} requires permission`)
          }
          overrides.push(`${item.sku}: ${eff.price} -> ${line.price}`)
        }

        const gross = line.price * line.qty
        const lineDiscount = Math.min(Math.max(Math.trunc(line.line_discount) || 0, 0), gross)
        const lineTotal = gross - lineDiscount

        subtotal += gross
        lineDiscTotal += lineDiscount
        if (item.tax_type === 'vat') vatable += lineTotal
        preparedLines.push({ item, qty: line.qty, price: line.price, lineDiscount, lineTotal, promoId })
      }

      const base = subtotal - lineDiscTotal
      const vatRate = Number(getSetting(db, 'vat_rate') ?? 12)
      // VAT mode: 'overall' (e.g. restaurants) makes the whole sale vatable,
      // ignoring per-item flags; 'per_item' (default) uses each item's tax_type.
      if ((getSetting(db, 'vat_mode') || 'per_item') === 'overall') vatable = base

      // Senior/PWD: a flat 20% transaction discount. VAT still applies and is
      // reported normally. Captures the presented ID. Replaces a manual discount.
      const special = input.special_discount
      let txnDisc = 0
      if (special) {
        if (special.type !== 'senior' && special.type !== 'pwd') {
          throw new Error('Invalid special discount type')
        }
        if (!special.id?.trim()) throw new Error('Senior/PWD ID number is required')
        txnDisc = Math.round(base * 0.2)
      } else if (input.discount_type === 'percent') {
        const pct = Math.min(Math.max(Math.trunc(input.discount_value) || 0, 0), 100)
        txnDisc = Math.round((base * pct) / 100)
      } else if (input.discount_type === 'amount') {
        txnDisc = Math.min(Math.max(Math.trunc(input.discount_value) || 0, 0), base)
      }
      const afterDiscounts = base - txnDisc

      // Manual discounts (line or transaction) are permission-gated. A cashier
      // without `discount` needs an approving supervisor — validated here so the
      // UI gate can't be bypassed. Senior/PWD (special) is exempt.
      if ((lineDiscTotal > 0 || txnDisc > 0) && !user.permissions.includes('discount')) {
        const ap = input.discount_approver
        if (!ap?.username || !ap?.password) {
          throw new Error('Applying a discount needs supervisor approval')
        }
        const sup = db
          .prepare('SELECT username, password_hash, role_id FROM users WHERE username = ? AND active = 1')
          .get(ap.username) as
          | { username: string; password_hash: string; role_id: number }
          | undefined
        if (!sup || !bcrypt.compareSync(ap.password, sup.password_hash)) {
          throw new Error('Invalid supervisor credentials for discount')
        }
        const perms = (
          db.prepare('SELECT perm_key FROM role_permissions WHERE role_id = ?').all(sup.role_id) as {
            perm_key: string
          }[]
        ).map((p) => p.perm_key)
        if (!perms.includes('discount')) throw new Error(`${sup.username} cannot approve discounts`)
      }

      // Vouchers: re-validated inside the transaction; total deduction capped.
      let voucherDisc = 0
      const redeemed: { id: number; code: string }[] = []
      for (const code of [...new Set(input.voucher_codes ?? [])]) {
        const v = db.prepare('SELECT * FROM vouchers WHERE code = ?').get(code) as
          | Voucher
          | undefined
        if (!v) throw new Error(`Voucher ${code} not found`)
        if (v.status !== 'active') throw new Error(`Voucher ${code} is already ${v.status}`)
        if (v.expires_at && v.expires_at < nowUtc()) throw new Error(`Voucher ${code} has expired`)
        const remaining = afterDiscounts - voucherDisc
        const amount =
          v.type === 'percent'
            ? Math.round((afterDiscounts * v.value) / 100)
            : v.value
        voucherDisc += Math.min(Math.max(amount, 0), remaining)
        redeemed.push({ id: v.id, code: v.code })
      }

      const total = afterDiscounts - voucherDisc

      // Payments
      let paid = 0
      let chargeAmount = 0
      for (const p of input.payments) {
        if (!['cash', 'card', 'ewallet', 'gcash', 'paymaya', 'charge'].includes(p.method)) {
          throw new Error('Invalid payment method')
        }
        if (!Number.isInteger(p.amount) || p.amount <= 0) throw new Error('Invalid payment amount')
        paid += p.amount
        if (p.method === 'charge') chargeAmount += p.amount
      }
      if (paid < total) throw new Error('Payment is less than the total')
      const change = paid - total
      if (chargeAmount > total) throw new Error('Charge amount exceeds the total')

      if (chargeAmount > 0) {
        if (!input.customer_id) throw new Error('Charge-to-account needs a customer')
        const customer = db
          .prepare('SELECT * FROM customers WHERE id = ? AND active = 1')
          .get(input.customer_id) as { credit_limit: number; name: string } | undefined
        if (!customer) throw new Error('Customer not found or inactive')
        const { balance } = db
          .prepare(
            'SELECT COALESCE(SUM(debit - credit), 0) AS balance FROM ledger_entries WHERE customer_id = ?'
          )
          .get(input.customer_id) as { balance: number }
        if (customer.credit_limit > 0 && balance + chargeAmount > customer.credit_limit) {
          throw new Error(
            `Credit limit exceeded for ${customer.name} (balance + charge would pass the limit)`
          )
        }
      }

      // VAT (prices are VAT-inclusive): share the transaction-level discounts
      // across the vatable portion, then back out the tax for reporting.
      const vatShare = base > 0 ? vatable / base : 0
      const taxedBase = Math.max(vatable - Math.round((txnDisc + voucherDisc) * vatShare), 0)
      const tax = Math.round((taxedBase * vatRate) / (100 + vatRate))

      const paymentType = input.payments.length > 1 ? 'split' : input.payments[0].method
      const prefix = getSetting(db, 'sale_prefix') || 'SI-'
      const saleNo = prefix + String(bumpSequence(db, 'sale_sequence')).padStart(6, '0')

      const saleInfo = db
        .prepare(
          `INSERT INTO sales (sale_no, customer_id, user_id, subtotal, discount, voucher_discount,
             tax, total, payment_type, amount_paid, change, status, sd_type, sd_name, sd_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)`
        )
        .run(
          saleNo,
          input.customer_id,
          user.id,
          subtotal,
          lineDiscTotal + txnDisc,
          voucherDisc,
          tax,
          total,
          paymentType,
          paid,
          change,
          special ? special.type : '',
          special ? (special.name ?? '').trim() : '',
          special ? special.id.trim() : ''
        )
      const saleId = Number(saleInfo.lastInsertRowid)

      const insertLine = db.prepare(
        `INSERT INTO sale_items (sale_id, item_id, qty, price, cost_at_sale, line_discount, promo_id, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      const insertMovement = db.prepare(
        `INSERT INTO stock_movements (item_id, type, qty_change, ref_table, ref_id, user_id, note)
         VALUES (?, 'sale', ?, 'sales', ?, ?, ?)`
      )
      const updateStock = db.prepare('UPDATE items SET qty_on_hand = qty_on_hand - ? WHERE id = ?')

      for (const l of preparedLines) {
        insertLine.run(saleId, l.item.id, l.qty, l.price, l.item.cost_price, l.lineDiscount, l.promoId, l.lineTotal)
        insertMovement.run(l.item.id, -l.qty, saleId, user.id, saleNo)
        updateStock.run(l.qty, l.item.id)
      }

      const insertPayment = db.prepare('INSERT INTO payments (sale_id, method, amount) VALUES (?, ?, ?)')
      for (const p of input.payments) insertPayment.run(saleId, p.method, p.amount)

      for (const v of redeemed) {
        const res = db
          .prepare(
            `UPDATE vouchers SET status = 'redeemed', redeemed_sale_id = ?, redeemed_at = datetime('now')
             WHERE id = ? AND status = 'active'`
          )
          .run(saleId, v.id)
        if (res.changes === 0) throw new Error(`Voucher ${v.code} was redeemed by another sale`)
      }

      if (chargeAmount > 0) {
        db.prepare(
          `INSERT INTO ledger_entries (customer_id, type, ref_no, debit, credit, note, user_id)
           VALUES (?, 'charge', ?, ?, 0, 'Charge sale', ?)`
        ).run(input.customer_id, saleNo, chargeAmount, user.id)
      }

      for (const detail of overrides) {
        audit(db, user.id, 'price_override', `${saleNo} ${detail}`)
      }

      if (special) {
        audit(
          db,
          user.id,
          'senior_pwd_discount',
          `${saleNo} ${special.type} ID ${special.id.trim()} (${special.name?.trim() || 'n/a'}) -${txnDisc}`
        )
      }

      return saleId
    })()

    return loadReceipt(db, saleId)
  })

  // -- Void with optional supervisor override ----------------------------------

  handle<VoidSaleInput, SaleReceipt>('sales:void', ({ sale_id, reason, supervisor }) => {
    const user = requireAuth()
    const db = getDb()

    // Authorize: own permission, or a supervisor's credentials with approve_voids.
    let approverNote = ''
    if (!user.permissions.includes('void')) {
      if (!supervisor?.username || !supervisor?.password) {
        throw new Error('Void needs supervisor approval')
      }
      const sup = db
        .prepare(
          `SELECT u.id, u.username, u.password_hash, u.role_id FROM users u
           WHERE u.username = ? AND u.active = 1`
        )
        .get(supervisor.username) as
        | { id: number; username: string; password_hash: string; role_id: number }
        | undefined
      if (!sup || !bcrypt.compareSync(supervisor.password, sup.password_hash)) {
        throw new Error('Invalid supervisor credentials')
      }
      const perms = (
        db.prepare('SELECT perm_key FROM role_permissions WHERE role_id = ?').all(sup.role_id) as {
          perm_key: string
        }[]
      ).map((p) => p.perm_key)
      if (!perms.includes('approve_voids')) {
        throw new Error(`${sup.username} cannot approve voids`)
      }
      approverNote = ` approved by ${sup.username}`
    }

    db.transaction(() => {
      const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(sale_id) as
        | { id: number; sale_no: string; status: string; customer_id: number | null }
        | undefined
      if (!sale) throw new Error('Sale not found')
      if (sale.status !== 'completed') throw new Error(`Sale is already ${sale.status}`)

      db.prepare("UPDATE sales SET status = 'voided' WHERE id = ?").run(sale.id)

      // Return stock
      const lines = db
        .prepare('SELECT item_id, qty FROM sale_items WHERE sale_id = ?')
        .all(sale.id) as { item_id: number; qty: number }[]
      const insertMovement = db.prepare(
        `INSERT INTO stock_movements (item_id, type, qty_change, ref_table, ref_id, user_id, note)
         VALUES (?, 'return', ?, 'sales', ?, ?, ?)`
      )
      const updateStock = db.prepare('UPDATE items SET qty_on_hand = qty_on_hand + ? WHERE id = ?')
      for (const l of lines) {
        insertMovement.run(l.item_id, l.qty, sale.id, user.id, `void ${sale.sale_no}`)
        updateStock.run(l.qty, l.item_id)
      }

      // Reverse a charge on the customer ledger
      const charge = db
        .prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM payments WHERE sale_id = ? AND method = 'charge'")
        .get(sale.id) as { n: number }
      if (charge.n > 0 && sale.customer_id) {
        db.prepare(
          `INSERT INTO ledger_entries (customer_id, type, ref_no, debit, credit, note, user_id)
           VALUES (?, 'adj', ?, 0, ?, 'Void of charge sale', ?)`
        ).run(sale.customer_id, sale.sale_no, charge.n, user.id)
      }

      // Vouchers redeemed by this sale become usable again
      db.prepare(
        `UPDATE vouchers SET status = 'active', redeemed_sale_id = NULL, redeemed_at = NULL
         WHERE redeemed_sale_id = ?`
      ).run(sale.id)

      audit(db, user.id, 'void', `${sale.sale_no} reason: ${reason || 'n/a'}${approverNote}`)
    })()

    return loadReceipt(db, sale_id)
  })

  // -- History / reprint -------------------------------------------------------

  handle<{ limit?: number }, RecentSale[]>('sales:recent', (query = {}) => {
    requireAuth()
    const limit = Math.min(Math.max(query.limit ?? 30, 1), 100)
    return getDb()
      .prepare(
        `SELECT s.id, s.sale_no, s.datetime, s.total, s.status,
                COALESCE(u.full_name, u.username) AS cashier, c.name AS customer_name
         FROM sales s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN customers c ON c.id = s.customer_id
         ORDER BY s.id DESC LIMIT ?`
      )
      .all(limit) as RecentSale[]
  })

  handle<number, SaleReceipt>('sales:get', (id) => {
    requireAuth()
    return loadReceipt(getDb(), id)
  })

  // -- Hold / recall -------------------------------------------------------------

  handle<{ label: string; payload: string }, number>('sales:hold', ({ label, payload }) => {
    const user = requirePermission('sell')
    if (!payload) throw new Error('Nothing to hold')
    const info = getDb()
      .prepare('INSERT INTO held_sales (label, payload, user_id) VALUES (?, ?, ?)')
      .run((label ?? '').trim(), payload, user.id)
    return Number(info.lastInsertRowid)
  })

  handle<void, HeldSale[]>('sales:held', () => {
    requireAuth()
    return getDb()
      .prepare(
        `SELECT h.id, h.label, h.created_at, COALESCE(u.full_name, u.username) AS cashier
         FROM held_sales h JOIN users u ON u.id = h.user_id ORDER BY h.id DESC`
      )
      .all() as HeldSale[]
  })

  handle<number, string>('sales:recall', (id) => {
    requirePermission('sell')
    const db = getDb()
    return db.transaction(() => {
      const row = db.prepare('SELECT payload FROM held_sales WHERE id = ?').get(id) as
        | { payload: string }
        | undefined
      if (!row) throw new Error('Held sale not found (already recalled?)')
      db.prepare('DELETE FROM held_sales WHERE id = ?').run(id)
      return row.payload
    })()
  })

  handle<number, true>('sales:deleteHeld', (id) => {
    requirePermission('sell')
    getDb().prepare('DELETE FROM held_sales WHERE id = ?').run(id)
    return true
  })
}
