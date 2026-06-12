import type { Branding, SaleReceipt } from '../../shared/types'
import { formatPeso } from './money'
import { formatDateTime } from './datetime'

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Thermal receipt document for the silent print pipeline. The main process
 * measures the rendered height and sizes @page to the content, so this only
 * needs a fixed printable width.
 */
export function buildReceiptHtml(
  sale: SaleReceipt,
  settings: Record<string, string>,
  branding: Branding
): string {
  const widthMm = Number(settings.receipt_width_mm || 80)
  const printableMm = widthMm - 8

  const lines = sale.lines
    .map((l) => {
      const promo = l.promo_name ? `<div class="muted">  ${esc(l.promo_name)}</div>` : ''
      const discount = l.line_discount
        ? `<div class="muted">  less ${formatPeso(l.line_discount)}</div>`
        : ''
      return `<div class="row"><span>${esc(l.name)}</span></div>
        <div class="row"><span class="muted">  ${l.qty} ${esc(l.unit)} × ${formatPeso(l.price)}</span><span>${formatPeso(l.line_total)}</span></div>
        ${promo}${discount}`
    })
    .join('')

  const payments = sale.payments
    .map(
      (p) =>
        `<div class="row"><span>${p.method.toUpperCase()}</span><span>${formatPeso(p.amount)}</span></div>`
    )
    .join('')

  const voidBanner =
    sale.status === 'voided' ? '<div class="center big">*** VOIDED ***</div><hr>' : ''

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${printableMm}mm;
    margin: 0 auto;
    font-family: 'Courier New', monospace;
    font-size: 9pt;
    color: #000;
    padding: 2mm 0;
  }
  .center { text-align: center; }
  .big { font-size: 11pt; font-weight: bold; }
  .row { display: flex; justify-content: space-between; gap: 2mm; }
  .row span:last-child { white-space: nowrap; }
  .muted { font-size: 8pt; }
  .total-row { font-size: 12pt; font-weight: bold; }
  hr { border: none; border-top: 1px dashed #000; margin: 1.5mm 0; }
</style>
</head>
<body>
  <div class="center big">${esc(settings.store_name || branding.app_name)}</div>
  ${settings.store_address ? `<div class="center muted">${esc(settings.store_address)}</div>` : ''}
  ${settings.receipt_header ? `<div class="center muted">${esc(settings.receipt_header)}</div>` : ''}
  <hr>
  ${voidBanner}
  <div class="row"><span>${esc(sale.sale_no)}</span><span>${formatDateTime(sale.datetime)}</span></div>
  <div class="row"><span>Cashier: ${esc(sale.cashier)}</span></div>
  ${sale.customer_name ? `<div class="row"><span>Customer: ${esc(sale.customer_name)}</span></div>` : ''}
  <hr>
  ${lines}
  <hr>
  <div class="row"><span>Subtotal</span><span>${formatPeso(sale.subtotal)}</span></div>
  ${sale.discount ? `<div class="row"><span>Discount</span><span>-${formatPeso(sale.discount)}</span></div>` : ''}
  ${sale.voucher_discount ? `<div class="row"><span>Voucher</span><span>-${formatPeso(sale.voucher_discount)}</span></div>` : ''}
  <div class="row total-row"><span>TOTAL</span><span>${formatPeso(sale.total)}</span></div>
  <div class="row muted"><span>VAT (incl.)</span><span>${formatPeso(sale.tax)}</span></div>
  <hr>
  ${payments}
  <div class="row"><span>Tendered</span><span>${formatPeso(sale.amount_paid)}</span></div>
  <div class="row big"><span>CHANGE</span><span>${formatPeso(sale.change)}</span></div>
  <hr>
  ${settings.receipt_footer ? `<div class="center muted">${esc(settings.receipt_footer)}</div>` : ''}
</body>
</html>`
}
