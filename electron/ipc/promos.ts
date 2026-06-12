import type Database from 'better-sqlite3'
import { getDb } from '../db'
import { handle } from './handle'
import { requireAuth, requirePermission } from './session'
import type { Promo, PromoDetail, PromoInput } from '../../shared/types'

function validatePromoInput(input: PromoInput): void {
  if (!input.name?.trim()) throw new Error('Promo name is required')
  if (!['percent', 'amount', 'fixed_price'].includes(input.type)) throw new Error('Invalid promo type')
  if (!Number.isInteger(input.value) || input.value < 0) throw new Error('Invalid promo value')
  if (input.type === 'percent' && (input.value < 1 || input.value > 100)) {
    throw new Error('Percent must be between 1 and 100')
  }
  if (!input.itemIds?.length) throw new Error('Pick at least one item for the promo')
  if (input.starts_at && input.ends_at && input.ends_at < input.starts_at) {
    throw new Error('Promo end must be after its start')
  }
}

function writeItems(db: Database.Database, promoId: number, itemIds: number[]): void {
  db.prepare('DELETE FROM promo_items WHERE promo_id = ?').run(promoId)
  const insert = db.prepare('INSERT INTO promo_items (promo_id, item_id) VALUES (?, ?)')
  for (const itemId of new Set(itemIds)) insert.run(promoId, itemId)
}

const LIST_SQL = `
  SELECT p.*, (SELECT COUNT(*) FROM promo_items pi WHERE pi.promo_id = p.id) AS item_count
  FROM promos p`

export function registerPromoHandlers(): void {
  handle<void, Promo[]>('promos:list', () => {
    requireAuth()
    return getDb().prepare(`${LIST_SQL} ORDER BY p.id DESC`).all() as Promo[]
  })

  handle<number, PromoDetail>('promos:get', (id) => {
    requireAuth()
    const db = getDb()
    const promo = db.prepare(`${LIST_SQL} WHERE p.id = ?`).get(id) as Promo | undefined
    if (!promo) throw new Error('Promo not found')
    const itemIds = (
      db.prepare('SELECT item_id FROM promo_items WHERE promo_id = ?').all(id) as {
        item_id: number
      }[]
    ).map((r) => r.item_id)
    return { ...promo, itemIds }
  })

  handle<PromoInput, number>('promos:create', (input) => {
    requirePermission('edit_items')
    validatePromoInput(input)
    const db = getDb()
    return db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO promos (name, type, value, starts_at, ends_at, active)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.name.trim(),
          input.type,
          input.value,
          input.starts_at,
          input.ends_at,
          input.active ? 1 : 0
        )
      const promoId = Number(info.lastInsertRowid)
      writeItems(db, promoId, input.itemIds)
      return promoId
    })()
  })

  handle<{ id: number; input: PromoInput }, true>('promos:update', ({ id, input }) => {
    requirePermission('edit_items')
    validatePromoInput(input)
    const db = getDb()
    db.transaction(() => {
      const info = db
        .prepare(
          `UPDATE promos SET name = ?, type = ?, value = ?, starts_at = ?, ends_at = ?, active = ?
           WHERE id = ?`
        )
        .run(
          input.name.trim(),
          input.type,
          input.value,
          input.starts_at,
          input.ends_at,
          input.active ? 1 : 0,
          id
        )
      if (info.changes === 0) throw new Error('Promo not found')
      writeItems(db, id, input.itemIds)
    })()
    return true
  })

  handle<{ id: number; active: number }, true>('promos:setActive', ({ id, active }) => {
    requirePermission('edit_items')
    const info = getDb()
      .prepare('UPDATE promos SET active = ? WHERE id = ?')
      .run(active ? 1 : 0, id)
    if (info.changes === 0) throw new Error('Promo not found')
    return true
  })
}
