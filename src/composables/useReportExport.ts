import { useToast } from './useToast'
import { useSettingsStore } from '@/stores/settings'
import type { ExcelExport } from '../../shared/types'

export interface PrintColumn {
  label: string
  align?: 'left' | 'right'
}

export interface PrintReport {
  title: string
  subtitle?: string
  columns: PrintColumn[]
  /** Pre-formatted display strings, one array per row. */
  rows: string[][]
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

/** Build a self-contained A4 HTML document for the print/PDF pipeline. */
function buildReportHtml(report: PrintReport, storeName: string): string {
  const head = report.columns
    .map((c) => `<th style="text-align:${c.align ?? 'left'}">${escapeHtml(c.label)}</th>`)
    .join('')
  const body = report.rows
    .map(
      (r) =>
        '<tr>' +
        r
          .map(
            (cell, i) =>
              `<td style="text-align:${report.columns[i]?.align ?? 'left'}">${escapeHtml(cell)}</td>`
          )
          .join('') +
        '</tr>'
    )
    .join('')

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #111827; margin: 0; }
    h1 { font-size: 16pt; margin: 0 0 2px; }
    .meta { color: #6b7280; font-size: 9pt; margin: 0 0 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    th, td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
    th { background: #f3f4f6; border-bottom: 2px solid #d1d5db; }
    tbody tr:last-child td { border-bottom: 2px solid #d1d5db; }
  </style></head><body>
    <h1>${escapeHtml(report.title)}</h1>
    <p class="meta">${escapeHtml(storeName)}${report.subtitle ? ' • ' + escapeHtml(report.subtitle) : ''}</p>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
  </body></html>`
}

/** Shared Excel + Print/PDF actions for every report tab. */
export function useReportExport() {
  const toast = useToast()
  const settings = useSettingsStore()

  async function exportExcel(payload: ExcelExport): Promise<void> {
    try {
      const path = await window.api.reports.exportExcel(payload)
      if (path) toast.success('Saved to ' + path)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Excel export failed')
    }
  }

  async function printReport(report: PrintReport): Promise<void> {
    try {
      const storeName = settings.app['store_name'] || settings.branding.app_name
      await window.api.print.html(buildReportHtml(report, storeName))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Print failed')
    }
  }

  return { exportExcel, printReport }
}
