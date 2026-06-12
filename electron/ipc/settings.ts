import { getDb } from '../db'
import { handle } from './handle'
import { requireAuth, requirePermission } from './session'

/** Sequence counters & internals that must never be edited through settings:set. */
const PROTECTED_KEYS = new Set(['sale_sequence', 'voucher_sequence', 'barcode_sequence'])

export function registerSettingsHandlers(): void {
  handle<void, Record<string, string>>('settings:get', () => {
    requireAuth()
    const rows = getDb().prepare('SELECT key, value FROM settings').all() as {
      key: string
      value: string
    }[]
    return Object.fromEntries(rows.map((r) => [r.key, r.value]))
  })

  handle<{ key: string; value: string }, true>('settings:set', ({ key, value }) => {
    requirePermission('manage_settings')
    if (PROTECTED_KEYS.has(key)) throw new Error('That setting cannot be changed directly')
    const info = getDb()
      .prepare('UPDATE settings SET value = ? WHERE key = ?')
      .run(value, key)
    if (info.changes === 0) {
      getDb().prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value)
    }
    return true
  })
}
