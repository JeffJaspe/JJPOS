import { getDb } from '../db'
import { handle } from './handle'
import { requireAuth, requirePermission } from './session'
import type { Category, Supplier } from '../../shared/types'

/** Small supporting masterfiles: categories and suppliers. */
export function registerMasterfileHandlers(): void {
  // -- Categories ------------------------------------------------------------

  handle<void, Category[]>('categories:list', () => {
    requireAuth()
    return getDb()
      .prepare('SELECT * FROM categories ORDER BY name COLLATE NOCASE')
      .all() as Category[]
  })

  handle<string, number>('categories:create', (name) => {
    requirePermission('edit_items')
    if (!name?.trim()) throw new Error('Category name is required')
    try {
      const info = getDb().prepare('INSERT INTO categories (name) VALUES (?)').run(name.trim())
      return Number(info.lastInsertRowid)
    } catch {
      throw new Error('That category already exists')
    }
  })

  handle<{ id: number; name: string }, true>('categories:update', ({ id, name }) => {
    requirePermission('edit_items')
    if (!name?.trim()) throw new Error('Category name is required')
    try {
      const info = getDb()
        .prepare('UPDATE categories SET name = ? WHERE id = ?')
        .run(name.trim(), id)
      if (info.changes === 0) throw new Error('Category not found')
      return true
    } catch (err) {
      if (err instanceof Error && err.message.includes('UNIQUE')) {
        throw new Error('That category already exists')
      }
      throw err
    }
  })

  handle<number, true>('categories:remove', (id) => {
    requirePermission('edit_items')
    try {
      getDb().prepare('DELETE FROM categories WHERE id = ?').run(id)
      return true
    } catch {
      // FK constraint: items still point at it.
      throw new Error('Cannot delete: items are still using this category')
    }
  })

  // -- Suppliers ---------------------------------------------------------------
  // Soft-delete only (active flag) — Phase 4 receiving will reference suppliers.

  handle<{ includeInactive?: boolean }, Supplier[]>('suppliers:list', (query = {}) => {
    requireAuth()
    const sql = `SELECT * FROM suppliers
      ${query.includeInactive ? '' : 'WHERE active = 1'}
      ORDER BY name COLLATE NOCASE`
    return getDb().prepare(sql).all() as Supplier[]
  })

  handle<{ name: string; contact: string }, number>('suppliers:create', ({ name, contact }) => {
    requirePermission('edit_items')
    if (!name?.trim()) throw new Error('Supplier name is required')
    const info = getDb()
      .prepare('INSERT INTO suppliers (name, contact) VALUES (?, ?)')
      .run(name.trim(), contact?.trim() ?? '')
    return Number(info.lastInsertRowid)
  })

  handle<{ id: number; name: string; contact: string; active: number }, true>(
    'suppliers:update',
    ({ id, name, contact, active }) => {
      requirePermission('edit_items')
      if (!name?.trim()) throw new Error('Supplier name is required')
      const info = getDb()
        .prepare('UPDATE suppliers SET name = ?, contact = ?, active = ? WHERE id = ?')
        .run(name.trim(), contact?.trim() ?? '', active ? 1 : 0, id)
      if (info.changes === 0) throw new Error('Supplier not found')
      return true
    }
  )
}
