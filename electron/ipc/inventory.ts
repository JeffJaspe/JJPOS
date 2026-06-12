import { getDb } from '../db'
import { handle } from './handle'
import { requireAuth, requirePermission } from './session'
import type {
  AdjustInput,
  LowStockRow,
  MovementQuery,
  MovementRow,
  StockInInput,
  StocktakeInput,
  StocktakeResult
} from '../../shared/types'

const ADJUST_REASONS = ['damage', 'loss', 'expired', 'count_correction', 'other']
const MOVEMENT_TYPES = ['sale', 'return', 'stock_in', 'adjustment', 'count']

export function registerInventoryHandlers(): void {
  /** Receiving from a supplier: adds stock and optionally records new costs. */
  handle<StockInInput, true>('inventory:stockIn', (input) => {
    const user = requirePermission('stock_adjust')
    const db = getDb()
    if (!input.lines?.length) throw new Error('Add at least one item to receive')
    if (!input.ref_no?.trim()) throw new Error('Reference no. is required (e.g. supplier DR/invoice)')

    db.transaction(() => {
      let supplierName = ''
      if (input.supplier_id != null) {
        const supplier = db
          .prepare('SELECT name FROM suppliers WHERE id = ?')
          .get(input.supplier_id) as { name: string } | undefined
        if (!supplier) throw new Error('Supplier not found')
        supplierName = supplier.name
      }
      const note = [input.ref_no.trim(), supplierName, input.note?.trim()]
        .filter(Boolean)
        .join(' — ')

      const insertMovement = db.prepare(
        `INSERT INTO stock_movements (item_id, type, qty_change, ref_table, ref_id, user_id, note)
         VALUES (?, 'stock_in', ?, NULL, NULL, ?, ?)`
      )
      const updateQty = db.prepare('UPDATE items SET qty_on_hand = qty_on_hand + ? WHERE id = ?')
      const updateCost = db.prepare('UPDATE items SET cost_price = ? WHERE id = ?')

      for (const line of input.lines) {
        const item = db.prepare('SELECT id, name FROM items WHERE id = ?').get(line.item_id) as
          | { id: number; name: string }
          | undefined
        if (!item) throw new Error('Item not found')
        if (!Number.isInteger(line.qty) || line.qty < 1) {
          throw new Error(`Invalid quantity for ${item.name}`)
        }
        if (line.new_cost !== null && (!Number.isInteger(line.new_cost) || line.new_cost < 0)) {
          throw new Error(`Invalid cost for ${item.name}`)
        }
        insertMovement.run(item.id, line.qty, user.id, note)
        updateQty.run(line.qty, item.id)
        if (line.new_cost !== null) updateCost.run(line.new_cost, item.id)
      }

      db.prepare('INSERT INTO audit_log (user_id, action, detail) VALUES (?, ?, ?)').run(
        user.id,
        'stock_in',
        `${input.lines.length} line(s) — ${note}`
      )
    })()
    return true
  })

  /** Manual correction with a reason code (damage, loss, ...). */
  handle<AdjustInput, true>('inventory:adjust', (input) => {
    const user = requirePermission('stock_adjust')
    const db = getDb()
    if (!ADJUST_REASONS.includes(input.reason)) throw new Error('Pick a reason')
    if (!Number.isInteger(input.qty_change) || input.qty_change === 0) {
      throw new Error('Quantity change cannot be zero')
    }

    db.transaction(() => {
      const item = db.prepare('SELECT id, name FROM items WHERE id = ?').get(input.item_id) as
        | { id: number; name: string }
        | undefined
      if (!item) throw new Error('Item not found')

      const note = input.note?.trim() ? `${input.reason}: ${input.note.trim()}` : input.reason
      db.prepare(
        `INSERT INTO stock_movements (item_id, type, qty_change, ref_table, ref_id, user_id, note)
         VALUES (?, 'adjustment', ?, NULL, NULL, ?, ?)`
      ).run(item.id, input.qty_change, user.id, note)
      db.prepare('UPDATE items SET qty_on_hand = qty_on_hand + ? WHERE id = ?').run(
        input.qty_change,
        item.id
      )
      db.prepare('INSERT INTO audit_log (user_id, action, detail) VALUES (?, ?, ?)').run(
        user.id,
        'stock_adjust',
        `${item.name} ${input.qty_change > 0 ? '+' : ''}${input.qty_change} (${note})`
      )
    })()
    return true
  })

  /**
   * Physical count: each counted line becomes a 'count' movement for the
   * variance and the cached quantity is set to the counted figure.
   */
  handle<StocktakeInput, StocktakeResult>('inventory:stocktake', (input) => {
    const user = requirePermission('stock_adjust')
    const db = getDb()
    if (!input.lines?.length) throw new Error('Count at least one item')

    return db.transaction(() => {
      let adjusted = 0
      let unchanged = 0
      const note = input.note?.trim() ? `stocktake — ${input.note.trim()}` : 'stocktake'

      for (const line of input.lines) {
        const item = db
          .prepare('SELECT id, name, qty_on_hand FROM items WHERE id = ?')
          .get(line.item_id) as { id: number; name: string; qty_on_hand: number } | undefined
        if (!item) throw new Error('Item not found')
        if (!Number.isInteger(line.counted_qty) || line.counted_qty < 0) {
          throw new Error(`Invalid count for ${item.name}`)
        }
        const delta = line.counted_qty - item.qty_on_hand
        if (delta === 0) {
          unchanged++
          continue
        }
        db.prepare(
          `INSERT INTO stock_movements (item_id, type, qty_change, ref_table, ref_id, user_id, note)
           VALUES (?, 'count', ?, NULL, NULL, ?, ?)`
        ).run(item.id, delta, user.id, note)
        db.prepare('UPDATE items SET qty_on_hand = ? WHERE id = ?').run(line.counted_qty, item.id)
        adjusted++
      }

      db.prepare('INSERT INTO audit_log (user_id, action, detail) VALUES (?, ?, ?)').run(
        user.id,
        'stocktake',
        `${input.lines.length} counted, ${adjusted} adjusted`
      )
      return { adjusted, unchanged }
    })()
  })

  handle<MovementQuery, MovementRow[]>('inventory:movements', (query = {}) => {
    requireAuth()
    const where: string[] = []
    const params: unknown[] = []
    if (query.itemId != null) {
      where.push('m.item_id = ?')
      params.push(query.itemId)
    }
    if (query.type && MOVEMENT_TYPES.includes(query.type)) {
      where.push('m.type = ?')
      params.push(query.type)
    }
    const limit = Math.min(Math.max(query.limit ?? 200, 1), 500)
    return getDb()
      .prepare(
        `SELECT m.id, m.datetime, i.name AS item_name, i.sku, m.type, m.qty_change, m.note,
                COALESCE(u.full_name, u.username) AS user
         FROM stock_movements m
         JOIN items i ON i.id = m.item_id
         JOIN users u ON u.id = m.user_id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY m.id DESC LIMIT ?`
      )
      .all(...params, limit) as MovementRow[]
  })

  handle<void, LowStockRow[]>('inventory:lowStock', () => {
    requireAuth()
    return getDb()
      .prepare(
        `SELECT id, sku, name, unit, qty_on_hand, reorder_level
         FROM items
         WHERE active = 1 AND reorder_level > 0 AND qty_on_hand <= reorder_level
         ORDER BY (qty_on_hand * 1.0 / reorder_level), name COLLATE NOCASE`
      )
      .all() as LowStockRow[]
  })
}
