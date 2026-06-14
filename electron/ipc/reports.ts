import { BrowserWindow, dialog } from 'electron'
import { writeFile } from 'node:fs/promises'
import ExcelJS from 'exceljs'
import { getDb } from '../db'
import { handle } from './handle'
import { requirePermission } from './session'
import type {
  AuditLogQuery,
  AuditRow,
  DailySalesReport,
  ExcelExport,
  InventoryValuationReport,
  InventoryValuationRow,
  ReportRange,
  SalesByCategoryRow,
  SalesByItemRow,
  TransactionRow
} from '../../shared/types'

/** Which audit-log actions each security report includes. */
const AUDIT_CATEGORIES: Record<string, string[]> = {
  logins: ['login', 'logout'],
  overrides: ['override'],
  voids: ['void'],
  discounts: ['senior_pwd_discount', 'price_override']
}

export function registerReportHandlers(): void {
  /** Z-reading: totals, payment-method split, and per-cashier split for a period. */
  handle<ReportRange, DailySalesReport>('reports:dailySales', ({ fromUtc, toUtc }) => {
    requirePermission('export_reports')
    const db = getDb()

    const summary = db
      .prepare(
        `SELECT COUNT(*) AS count,
                COALESCE(SUM(subtotal), 0) AS gross,
                COALESCE(SUM(discount), 0) AS discount,
                COALESCE(SUM(voucher_discount), 0) AS voucherDiscount,
                COALESCE(SUM(tax), 0) AS tax,
                COALESCE(SUM(total), 0) AS net
         FROM sales
         WHERE status = 'completed' AND datetime >= ? AND datetime < ?`
      )
      .get(fromUtc, toUtc) as Omit<
      DailySalesReport,
      'voidedCount' | 'voidedAmount' | 'byPayment' | 'byCashier'
    >

    const voided = db
      .prepare(
        `SELECT COUNT(*) AS voidedCount, COALESCE(SUM(total), 0) AS voidedAmount
         FROM sales WHERE status = 'voided' AND datetime >= ? AND datetime < ?`
      )
      .get(fromUtc, toUtc) as { voidedCount: number; voidedAmount: number }

    const byPayment = db
      .prepare(
        `SELECT p.method, COALESCE(SUM(p.amount), 0) AS amount, COUNT(DISTINCT s.id) AS count
         FROM payments p JOIN sales s ON s.id = p.sale_id
         WHERE s.status = 'completed' AND s.datetime >= ? AND s.datetime < ?
         GROUP BY p.method ORDER BY amount DESC`
      )
      .all(fromUtc, toUtc) as DailySalesReport['byPayment']

    const byCashier = db
      .prepare(
        `SELECT COALESCE(u.full_name, u.username) AS user,
                COALESCE(SUM(s.total), 0) AS net, COUNT(*) AS count
         FROM sales s JOIN users u ON u.id = s.user_id
         WHERE s.status = 'completed' AND s.datetime >= ? AND s.datetime < ?
         GROUP BY s.user_id ORDER BY net DESC`
      )
      .all(fromUtc, toUtc) as DailySalesReport['byCashier']

    return { ...summary, ...voided, byPayment, byCashier }
  })

  handle<ReportRange, SalesByItemRow[]>('reports:salesByItem', ({ fromUtc, toUtc }) => {
    requirePermission('export_reports')
    return getDb()
      .prepare(
        `SELECT si.item_id, i.sku, i.name,
                COALESCE(SUM(si.qty), 0) AS qty,
                COALESCE(SUM(si.line_total), 0) AS sales,
                COALESCE(SUM(si.cost_at_sale * si.qty), 0) AS cost,
                COALESCE(SUM(si.line_total), 0) - COALESCE(SUM(si.cost_at_sale * si.qty), 0) AS profit
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         JOIN items i ON i.id = si.item_id
         WHERE s.status = 'completed' AND s.datetime >= ? AND s.datetime < ?
         GROUP BY si.item_id
         ORDER BY sales DESC`
      )
      .all(fromUtc, toUtc) as SalesByItemRow[]
  })

  handle<ReportRange, SalesByCategoryRow[]>('reports:salesByCategory', ({ fromUtc, toUtc }) => {
    requirePermission('export_reports')
    return getDb()
      .prepare(
        `SELECT COALESCE(c.name, 'Uncategorized') AS category,
                COALESCE(SUM(si.qty), 0) AS qty,
                COALESCE(SUM(si.line_total), 0) AS sales,
                COALESCE(SUM(si.cost_at_sale * si.qty), 0) AS cost,
                COALESCE(SUM(si.line_total), 0) - COALESCE(SUM(si.cost_at_sale * si.qty), 0) AS profit
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         JOIN items i ON i.id = si.item_id
         LEFT JOIN categories c ON c.id = i.category_id
         WHERE s.status = 'completed' AND s.datetime >= ? AND s.datetime < ?
         GROUP BY c.id
         ORDER BY sales DESC`
      )
      .all(fromUtc, toUtc) as SalesByCategoryRow[]
  })

  /** One row per sale in the period — sale no, timestamp, who rang it up, total. */
  handle<ReportRange, TransactionRow[]>('reports:transactions', ({ fromUtc, toUtc }) => {
    requirePermission('export_reports')
    return getDb()
      .prepare(
        `SELECT s.sale_no, s.datetime,
                COALESCE(u.full_name, u.username) AS cashier,
                c.name AS customer, s.payment_type, s.total, s.status
         FROM sales s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN customers c ON c.id = s.customer_id
         WHERE s.datetime >= ? AND s.datetime < ?
         ORDER BY s.datetime DESC, s.id DESC`
      )
      .all(fromUtc, toUtc) as TransactionRow[]
  })

  /** Stock-on-hand valuation at current cost and retail (a snapshot, not a period). */
  handle<void, InventoryValuationReport>('reports:inventoryValuation', () => {
    requirePermission('export_reports')
    const rows = getDb()
      .prepare(
        `SELECT id, sku, name, unit, qty_on_hand, cost_price, sell_price,
                qty_on_hand * cost_price AS cost_value,
                qty_on_hand * sell_price AS retail_value
         FROM items
         WHERE active = 1
         ORDER BY name COLLATE NOCASE`
      )
      .all() as InventoryValuationRow[]
    const totalCostValue = rows.reduce((s, r) => s + r.cost_value, 0)
    const totalRetailValue = rows.reduce((s, r) => s + r.retail_value, 0)
    return { rows, totalCostValue, totalRetailValue }
  })

  /** Security/audit reports: logins, supervisor (manager-key) overrides, voids, discounts. */
  handle<AuditLogQuery, AuditRow[]>('reports:auditLog', ({ fromUtc, toUtc, category }) => {
    requirePermission('view_audit')
    const actions = AUDIT_CATEGORIES[category]
    const where = ['a.datetime >= ?', 'a.datetime < ?']
    const params: unknown[] = [fromUtc, toUtc]
    if (actions) {
      where.push(`a.action IN (${actions.map(() => '?').join(',')})`)
      params.push(...actions)
    }
    return getDb()
      .prepare(
        `SELECT a.datetime, COALESCE(u.full_name, u.username) AS user, a.action, a.detail
         FROM audit_log a
         LEFT JOIN users u ON u.id = a.user_id
         WHERE ${where.join(' AND ')}
         ORDER BY a.datetime DESC, a.id DESC
         LIMIT 1000`
      )
      .all(...params) as AuditRow[]
  })

  /** Generic Excel writer — every report tab funnels its visible rows through here. */
  handle<ExcelExport, string | null>('reports:exportExcel', async (payload) => {
    requirePermission('export_reports')
    const win = BrowserWindow.getFocusedWindow()
    const opts = {
      title: 'Export to Excel',
      defaultPath: payload.fileName,
      filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
    }
    const result = await (win ? dialog.showSaveDialog(win, opts) : dialog.showSaveDialog(opts))
    if (result.canceled || !result.filePath) return null

    const wb = new ExcelJS.Workbook()
    wb.created = new Date()
    const ws = wb.addWorksheet(payload.sheetName.slice(0, 31) || 'Report')

    payload.columns.forEach((c, i) => {
      ws.getColumn(i + 1).width = c.width ?? 18
    })

    let headerRowIndex = 1
    if (payload.title) {
      ws.mergeCells(1, 1, 1, Math.max(payload.columns.length, 1))
      const titleCell = ws.getCell(1, 1)
      titleCell.value = payload.title
      titleCell.font = { bold: true, size: 14 }
      headerRowIndex = 3 // leave row 2 blank as a spacer
    }

    const headerRow = ws.getRow(headerRowIndex)
    payload.columns.forEach((c, i) => {
      const cell = headerRow.getCell(i + 1)
      cell.value = c.header
      cell.font = { bold: true }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }
    })

    let rowIndex = headerRowIndex + 1
    for (const data of payload.rows) {
      const row = ws.getRow(rowIndex++)
      payload.columns.forEach((c, i) => {
        const cell = row.getCell(i + 1)
        cell.value = (data[c.key] ?? '') as string | number
        if (c.format === 'money') cell.numFmt = '#,##0.00'
        else if (c.format === 'int') cell.numFmt = '#,##0'
        else if (c.format === 'percent') cell.numFmt = '0.0"%"'
      })
    }

    await writeFile(result.filePath, Buffer.from(await wb.xlsx.writeBuffer()))
    return result.filePath
  })
}
