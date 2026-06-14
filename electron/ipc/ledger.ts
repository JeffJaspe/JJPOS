import { getDb } from '../db'
import { handle } from './handle'
import { requireAuth, requirePermission } from './session'
import type {
  LedgerCustomer,
  LedgerEntryQuery,
  LedgerEntryRow,
  LedgerPaymentInput
} from '../../shared/types'

const METHODS = ['cash', 'check', 'pdc', 'card', 'gcash', 'paymaya']

interface AgingEntry {
  datetime: string
  debit: number
  credit: number
}

function ageInDays(utc: string, now: number): number {
  const t = new Date(utc.replace(' ', 'T') + 'Z').getTime()
  return (now - t) / 86_400_000
}

/**
 * FIFO aging: apply payments/credits to the oldest open charges, then bucket
 * whatever remains by how long it has been outstanding.
 */
function aging(entries: AgingEntry[], now: number): { current: number; d30: number; d60: number; d90: number } {
  const charges: { date: string; rem: number }[] = []
  for (const e of entries) {
    const net = e.debit - e.credit
    if (net > 0) {
      charges.push({ date: e.datetime, rem: net })
    } else if (net < 0) {
      let pay = -net
      for (const c of charges) {
        if (pay <= 0) break
        const take = Math.min(c.rem, pay)
        c.rem -= take
        pay -= take
      }
    }
  }
  let current = 0
  let d30 = 0
  let d60 = 0
  let d90 = 0
  for (const c of charges) {
    if (c.rem <= 0) continue
    const age = ageInDays(c.date, now)
    if (age <= 30) current += c.rem
    else if (age <= 60) d30 += c.rem
    else if (age <= 90) d60 += c.rem
    else d90 += c.rem
  }
  return { current, d30, d60, d90 }
}

export function registerLedgerHandlers(): void {
  /** All active customers with their AR balance + aging buckets. */
  handle<void, LedgerCustomer[]>('ledger:summary', () => {
    requireAuth()
    const db = getDb()
    const customers = db
      .prepare('SELECT id, code, name, credit_limit FROM customers WHERE active = 1 ORDER BY name COLLATE NOCASE')
      .all() as { id: number; code: string; name: string; credit_limit: number }[]
    const entries = db
      .prepare('SELECT customer_id, datetime, debit, credit FROM ledger_entries ORDER BY customer_id, datetime, id')
      .all() as { customer_id: number; datetime: string; debit: number; credit: number }[]

    const byCustomer = new Map<number, AgingEntry[]>()
    for (const e of entries) {
      const list = byCustomer.get(e.customer_id) ?? []
      list.push(e)
      byCustomer.set(e.customer_id, list)
    }
    const now = Date.now()
    return customers.map((c) => {
      const es = byCustomer.get(c.id) ?? []
      const balance = es.reduce((s, e) => s + e.debit - e.credit, 0)
      return { ...c, balance, ...aging(es, now) }
    })
  })

  /** Ledger entries for one customer, with a running balance and filters. */
  handle<LedgerEntryQuery, LedgerEntryRow[]>('ledger:entries', (q) => {
    requireAuth()
    if (!q?.customerId) return []
    const db = getDb()
    const where = ['l.customer_id = ?']
    const params: unknown[] = [q.customerId]
    if (q.fromUtc) {
      where.push('l.datetime >= ?')
      params.push(q.fromUtc)
    }
    if (q.toUtc) {
      where.push('l.datetime < ?')
      params.push(q.toUtc)
    }
    if (q.type) {
      where.push('l.type = ?')
      params.push(q.type)
    }
    const rows = db
      .prepare(
        `SELECT l.id, l.datetime, l.type, l.ref_no, l.method, l.bank, l.check_no,
                l.check_date, l.check_due_date, l.debit, l.credit, l.note,
                COALESCE(u.full_name, u.username) AS user
         FROM ledger_entries l
         LEFT JOIN users u ON u.id = l.user_id
         WHERE ${where.join(' AND ')}
         ORDER BY l.datetime, l.id`
      )
      .all(...params) as Omit<LedgerEntryRow, 'balance'>[]

    // Seed the running balance with everything before the from-date so a filtered
    // statement still shows a correct carried-forward balance.
    let running = 0
    if (q.fromUtc) {
      const ob = db
        .prepare('SELECT COALESCE(SUM(debit - credit), 0) AS b FROM ledger_entries WHERE customer_id = ? AND datetime < ?')
        .get(q.customerId, q.fromUtc) as { b: number }
      running = ob.b
    }
    return rows.map((r) => {
      running += r.debit - r.credit
      return { ...r, balance: running }
    })
  })

  /** Record an AR payment (cash / check / PDC / card / e-wallet) against a customer. */
  handle<LedgerPaymentInput, number>('ledger:payment', (input) => {
    const user = requirePermission('manage_ledger')
    const db = getDb()
    if (!input.customer_id) throw new Error('Pick a customer')
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error('Enter a valid amount')
    if (!METHODS.includes(input.method)) throw new Error('Pick a payment method')
    const customer = db
      .prepare('SELECT id, name FROM customers WHERE id = ? AND active = 1')
      .get(input.customer_id) as { id: number; name: string } | undefined
    if (!customer) throw new Error('Customer not found')
    if ((input.method === 'check' || input.method === 'pdc') && !input.check_no?.trim()) {
      throw new Error('Check number is required')
    }

    return db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO ledger_entries
             (customer_id, type, ref_no, debit, credit, note, user_id, method,
              bank, check_no, check_date, check_due_date)
           VALUES (?, 'payment', ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.customer_id,
          (input.or_no ?? '').trim(),
          input.amount,
          (input.note ?? '').trim(),
          user.id,
          input.method,
          (input.bank ?? '').trim(),
          (input.check_no ?? '').trim(),
          (input.check_date ?? '').trim(),
          (input.due_date ?? '').trim()
        )
      db.prepare('INSERT INTO audit_log (user_id, action, detail) VALUES (?, ?, ?)').run(
        user.id,
        'ar_payment',
        `${customer.name} ${input.method} ${input.amount}${input.or_no ? ' OR ' + input.or_no.trim() : ''}`
      )
      return Number(info.lastInsertRowid)
    })()
  })
}
