import { getDb } from '../db'
import { handle } from './handle'
import { requirePermission } from './session'
import { ean13CheckDigit } from '../../shared/barcode'
import type { Voucher, VoucherCreateInput, VoucherStatus } from '../../shared/types'

export function registerVoucherHandlers(): void {
  handle<{ status?: VoucherStatus | 'all' }, Voucher[]>('vouchers:list', (query = {}) => {
    requirePermission('manage_vouchers')
    const db = getDb()
    if (query.status && query.status !== 'all') {
      return db
        .prepare('SELECT * FROM vouchers WHERE status = ? ORDER BY id DESC LIMIT 500')
        .all(query.status) as Voucher[]
    }
    return db.prepare('SELECT * FROM vouchers ORDER BY id DESC LIMIT 500').all() as Voucher[]
  })

  /**
   * Issue one or many vouchers. Codes come from a dedicated sequence with the
   * '9' prefix (EAN-13 with check digit) so they can never collide with the
   * '2'-prefixed internal item barcodes.
   */
  handle<VoucherCreateInput, Voucher[]>('vouchers:create', (input) => {
    const user = requirePermission('manage_vouchers')
    const db = getDb()
    const count = Math.trunc(input.count)
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      throw new Error('Count must be between 1 and 100')
    }
    if (!['fixed', 'percent'].includes(input.type)) throw new Error('Invalid voucher type')
    if (!Number.isInteger(input.value) || input.value <= 0) throw new Error('Invalid voucher value')
    if (input.type === 'percent' && input.value > 100) throw new Error('Percent cannot exceed 100')

    return db.transaction(() => {
      const seqRow = db.prepare("SELECT value FROM settings WHERE key = 'voucher_sequence'").get() as
        | { value: string }
        | undefined
      let seq = Number(seqRow?.value ?? 0)
      const created: Voucher[] = []
      const insert = db.prepare(
        `INSERT INTO vouchers (code, type, value, expires_at, note) VALUES (?, ?, ?, ?, ?)`
      )
      for (let i = 0; i < count; i++) {
        let code: string
        do {
          seq++
          const body = '9' + String(seq).padStart(11, '0')
          code = body + ean13CheckDigit(body)
        } while (db.prepare('SELECT 1 FROM vouchers WHERE code = ?').get(code))
        const info = insert.run(code, input.type, input.value, input.expires_at, input.note?.trim() ?? '')
        created.push(
          db.prepare('SELECT * FROM vouchers WHERE id = ?').get(Number(info.lastInsertRowid)) as Voucher
        )
      }
      db.prepare("UPDATE settings SET value = ? WHERE key = 'voucher_sequence'").run(String(seq))
      db.prepare('INSERT INTO audit_log (user_id, action, detail) VALUES (?, ?, ?)').run(
        user.id,
        'voucher_issue',
        `${count} voucher(s): ${created[0].code}${count > 1 ? ' … ' + created[created.length - 1].code : ''}`
      )
      return created
    })()
  })

  handle<number, true>('vouchers:cancel', (id) => {
    const user = requirePermission('manage_vouchers')
    const db = getDb()
    db.transaction(() => {
      const voucher = db.prepare('SELECT * FROM vouchers WHERE id = ?').get(id) as
        | Voucher
        | undefined
      if (!voucher) throw new Error('Voucher not found')
      if (voucher.status !== 'active') {
        throw new Error(`Only active vouchers can be cancelled (this one is ${voucher.status})`)
      }
      db.prepare("UPDATE vouchers SET status = 'cancelled' WHERE id = ?").run(id)
      db.prepare('INSERT INTO audit_log (user_id, action, detail) VALUES (?, ?, ?)').run(
        user.id,
        'voucher_cancel',
        voucher.code
      )
    })()
    return true
  })
}
