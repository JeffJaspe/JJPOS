import type Database from 'better-sqlite3'
import { getDb } from '../db'
import { handle } from './handle'
import { requireAuth, requirePermission } from './session'
import { ean13CheckDigit } from '../../shared/barcode'
import type { ItemDetail, ItemInput, ItemListQuery, ItemRow } from '../../shared/types'

const UNITS = ['pc', 'box', 'kg', 'pack', 'set']

function validateItemInput(input: ItemInput): void {
  if (!input.sku?.trim()) throw new Error('SKU is required')
  if (!input.name?.trim()) throw new Error('Name is required')
  if (!UNITS.includes(input.unit)) throw new Error('Invalid unit')
  if (!['vat', 'non_vat'].includes(input.tax_type)) throw new Error('Invalid tax type')
  for (const [label, value] of [
    ['Cost price', input.cost_price],
    ['Selling price', input.sell_price],
    ['Reorder level', input.reorder_level]
  ] as const) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be zero or more`)
  }
  if (
    input.wholesale_price !== null &&
    (!Number.isInteger(input.wholesale_price) || input.wholesale_price < 0)
  ) {
    throw new Error('Wholesale price must be zero or more')
  }
  const seen = new Set<string>()
  for (const barcode of input.barcodes) {
    if (!barcode.trim()) throw new Error('Barcodes cannot be blank')
    if (seen.has(barcode)) throw new Error(`Duplicate barcode in list: ${barcode}`)
    seen.add(barcode)
  }
}

/** Replace the item's barcode set; caller must wrap in a transaction. */
function writeBarcodes(db: Database.Database, itemId: number, barcodes: string[]): void {
  for (const barcode of barcodes) {
    const owner = db
      .prepare('SELECT item_id FROM item_barcodes WHERE barcode = ?')
      .get(barcode) as { item_id: number } | undefined
    if (owner && owner.item_id !== itemId) {
      throw new Error(`Barcode ${barcode} is already assigned to another item`)
    }
  }
  db.prepare('DELETE FROM item_barcodes WHERE item_id = ?').run(itemId)
  const insert = db.prepare('INSERT INTO item_barcodes (item_id, barcode) VALUES (?, ?)')
  for (const barcode of barcodes) insert.run(itemId, barcode.trim())
}

/** Translate UNIQUE-constraint noise into a message the cashier can act on. */
function friendlyConstraint(err: unknown): never {
  if (err instanceof Error && err.message.includes('items.sku')) {
    throw new Error('That SKU is already in use')
  }
  throw err
}

const LIST_SQL = `
  SELECT i.*, c.name AS category_name,
         (SELECT COUNT(*) FROM item_barcodes b WHERE b.item_id = i.id) AS barcode_count
  FROM items i
  LEFT JOIN categories c ON c.id = i.category_id`

export function registerItemHandlers(): void {
  handle<ItemListQuery, ItemRow[]>('items:list', (query = {}) => {
    requireAuth()
    const db = getDb()
    const where: string[] = []
    const params: unknown[] = []

    if (query.search?.trim()) {
      const term = query.search.trim()
      where.push(
        `(i.name LIKE ? OR i.sku LIKE ? OR i.id IN (SELECT item_id FROM item_barcodes WHERE barcode = ?))`
      )
      params.push(`%${term}%`, `%${term}%`, term)
    }
    if (query.categoryId != null) {
      where.push('i.category_id = ?')
      params.push(query.categoryId)
    }
    if (!query.includeInactive) {
      where.push('i.active = 1')
    }

    const sql = `${LIST_SQL}
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY i.name COLLATE NOCASE
      LIMIT 1000`
    return db.prepare(sql).all(...params) as ItemRow[]
  })

  handle<number, ItemDetail>('items:get', (id) => {
    requireAuth()
    const db = getDb()
    const item = db.prepare(`${LIST_SQL} WHERE i.id = ?`).get(id) as ItemRow | undefined
    if (!item) throw new Error('Item not found')
    const barcodes = (
      db.prepare('SELECT barcode FROM item_barcodes WHERE item_id = ? ORDER BY id').all(id) as {
        barcode: string
      }[]
    ).map((b) => b.barcode)
    return { ...item, barcodes }
  })

  handle<ItemInput, number>('items:create', (input) => {
    requirePermission('edit_items')
    validateItemInput(input)
    const db = getDb()
    try {
      return db.transaction(() => {
        const info = db
          .prepare(
            `INSERT INTO items (sku, name, description, category_id, unit, cost_price,
               sell_price, wholesale_price, reorder_level, tax_type, active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            input.sku.trim(),
            input.name.trim(),
            input.description.trim(),
            input.category_id,
            input.unit,
            input.cost_price,
            input.sell_price,
            input.wholesale_price,
            input.reorder_level,
            input.tax_type,
            input.active ? 1 : 0
          )
        const itemId = Number(info.lastInsertRowid)
        writeBarcodes(db, itemId, input.barcodes)
        return itemId
      })()
    } catch (err) {
      friendlyConstraint(err)
    }
  })

  handle<{ id: number; input: ItemInput }, true>('items:update', ({ id, input }) => {
    requirePermission('edit_items')
    validateItemInput(input)
    const db = getDb()
    try {
      db.transaction(() => {
        const info = db
          .prepare(
            `UPDATE items SET sku = ?, name = ?, description = ?, category_id = ?, unit = ?,
               cost_price = ?, sell_price = ?, wholesale_price = ?, reorder_level = ?,
               tax_type = ?, active = ?
             WHERE id = ?`
          )
          .run(
            input.sku.trim(),
            input.name.trim(),
            input.description.trim(),
            input.category_id,
            input.unit,
            input.cost_price,
            input.sell_price,
            input.wholesale_price,
            input.reorder_level,
            input.tax_type,
            input.active ? 1 : 0,
            id
          )
        if (info.changes === 0) throw new Error('Item not found')
        writeBarcodes(db, id, input.barcodes)
      })()
      return true
    } catch (err) {
      friendlyConstraint(err)
    }
  })

  /**
   * Consume the next internal barcode: '2' (in-store prefix) + 11-digit
   * sequence + EAN-13 check digit. Gaps from abandoned forms are harmless.
   */
  handle<void, string>('items:nextBarcode', () => {
    requirePermission('edit_items')
    const db = getDb()
    return db.transaction(() => {
      const row = db.prepare("SELECT value FROM settings WHERE key = 'barcode_sequence'").get() as
        | { value: string }
        | undefined
      let seq = Number(row?.value ?? 0)
      let code: string
      do {
        seq++
        const body = '2' + String(seq).padStart(11, '0')
        code = body + ean13CheckDigit(body)
      } while (db.prepare('SELECT 1 FROM item_barcodes WHERE barcode = ?').get(code))
      db.prepare("UPDATE settings SET value = ? WHERE key = 'barcode_sequence'").run(String(seq))
      return code
    })()
  })
}
