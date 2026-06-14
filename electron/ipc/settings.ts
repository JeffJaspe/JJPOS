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

  /**
   * Set the next invoice (SI) number — what BIR-registered terminals need to
   * align the series with the registered range. `sale_sequence` holds the LAST
   * used number, so next = sequence + 1. Forward-only to avoid duplicate SI
   * numbers (the sale_no UNIQUE constraint would otherwise reject a sale).
   */
  handle<{ next: number }, true>('settings:setInvoiceNumber', ({ next }) => {
    const user = requirePermission('manage_settings')
    const db = getDb()
    if (!Number.isInteger(next) || next < 1) {
      throw new Error('Next invoice number must be a positive whole number')
    }
    const current = Number(
      (db.prepare("SELECT value FROM settings WHERE key = 'sale_sequence'").get() as
        | { value: string }
        | undefined)?.value ?? 0
    )
    const seq = next - 1
    if (seq < current) {
      throw new Error(
        `Next number can't be lower than the current series (already at ${current + 1})`
      )
    }
    const info = db.prepare("UPDATE settings SET value = ? WHERE key = 'sale_sequence'").run(String(seq))
    if (info.changes === 0) {
      db.prepare("INSERT INTO settings (key, value) VALUES ('sale_sequence', ?)").run(String(seq))
    }
    db.prepare('INSERT INTO audit_log (user_id, action, detail) VALUES (?, ?, ?)').run(
      user.id,
      'invoice_number_set',
      `Next SI number set to ${next}`
    )
    return true
  })
}
