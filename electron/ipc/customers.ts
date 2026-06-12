import { getDb } from '../db'
import { handle } from './handle'
import { requireAuth, requirePermission } from './session'
import type { CustomerInput, CustomerListQuery, CustomerRow } from '../../shared/types'

function validateCustomerInput(input: CustomerInput): void {
  if (!input.code?.trim()) throw new Error('Code is required')
  if (!input.name?.trim()) throw new Error('Name is required')
  if (!Number.isInteger(input.credit_limit) || input.credit_limit < 0) {
    throw new Error('Credit limit must be zero or more')
  }
  if (!Number.isInteger(input.terms_days) || input.terms_days < 0) {
    throw new Error('Terms must be zero or more days')
  }
  if (!Number.isInteger(input.opening_balance)) {
    throw new Error('Opening balance must be an amount')
  }
}

function friendlyConstraint(err: unknown): never {
  if (err instanceof Error && err.message.includes('customers.code')) {
    throw new Error('That customer code is already in use')
  }
  throw err
}

export function registerCustomerHandlers(): void {
  handle<CustomerListQuery, CustomerRow[]>('customers:list', (query = {}) => {
    requireAuth()
    const where: string[] = []
    const params: unknown[] = []

    if (query.search?.trim()) {
      where.push('(name LIKE ? OR code LIKE ? OR contact LIKE ?)')
      const term = `%${query.search.trim()}%`
      params.push(term, term, term)
    }
    if (!query.includeInactive) where.push('active = 1')

    const sql = `SELECT * FROM customers
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY name COLLATE NOCASE
      LIMIT 1000`
    return getDb().prepare(sql).all(...params) as CustomerRow[]
  })

  handle<CustomerInput, number>('customers:create', (input) => {
    const user = requirePermission('edit_customers')
    validateCustomerInput(input)
    const db = getDb()
    try {
      return db.transaction(() => {
        const info = db
          .prepare(
            `INSERT INTO customers (code, name, contact, address, tin, credit_limit,
               terms_days, opening_balance, active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            input.code.trim(),
            input.name.trim(),
            input.contact.trim(),
            input.address.trim(),
            input.tin.trim(),
            input.credit_limit,
            input.terms_days,
            input.opening_balance,
            input.active ? 1 : 0
          )
        const customerId = Number(info.lastInsertRowid)

        // Post the opening balance to the ledger now so Phase 5 can derive
        // running balances purely from ledger_entries.
        if (input.opening_balance !== 0) {
          db.prepare(
            `INSERT INTO ledger_entries (customer_id, type, ref_no, debit, credit, note, user_id)
             VALUES (?, 'adj', 'OB', ?, ?, 'Opening balance', ?)`
          ).run(
            customerId,
            input.opening_balance > 0 ? input.opening_balance : 0,
            input.opening_balance < 0 ? -input.opening_balance : 0,
            user.id
          )
        }
        return customerId
      })()
    } catch (err) {
      friendlyConstraint(err)
    }
  })

  handle<{ id: number; input: CustomerInput }, true>('customers:update', ({ id, input }) => {
    requirePermission('edit_customers')
    validateCustomerInput(input)
    try {
      // opening_balance deliberately not updatable — it lives in the ledger.
      const info = getDb()
        .prepare(
          `UPDATE customers SET code = ?, name = ?, contact = ?, address = ?, tin = ?,
             credit_limit = ?, terms_days = ?, active = ?
           WHERE id = ?`
        )
        .run(
          input.code.trim(),
          input.name.trim(),
          input.contact.trim(),
          input.address.trim(),
          input.tin.trim(),
          input.credit_limit,
          input.terms_days,
          input.active ? 1 : 0,
          id
        )
      if (info.changes === 0) throw new Error('Customer not found')
      return true
    } catch (err) {
      friendlyConstraint(err)
    }
  })
}
