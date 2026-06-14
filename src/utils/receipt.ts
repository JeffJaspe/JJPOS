import type { Branding, ReceiptElement, ReceiptTemplate, SaleReceipt } from '../../shared/types'
import { formatPeso } from './money'
import { formatDateTime } from './datetime'

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** The built-in layout — used when no custom template is saved. */
export function defaultReceiptTemplate(widthMm = 80): ReceiptTemplate {
  const el = (
    type: ReceiptElement['type'],
    extra: Partial<ReceiptElement> = {}
  ): ReceiptElement => ({ id: type + '_' + Math.random().toString(36).slice(2, 7), type, enabled: true, ...extra })
  return {
    width_mm: widthMm,
    elements: [
      el('logo', { align: 'center' }),
      el('store_name', { align: 'center', bold: true }),
      el('store_address', { align: 'center' }),
      el('header', { align: 'center' }),
      el('divider'),
      el('sale_info'),
      el('cashier'),
      el('customer'),
      el('sd_info'),
      el('divider'),
      el('items'),
      el('divider'),
      el('totals'),
      el('divider'),
      el('payments'),
      el('change'),
      el('divider'),
      el('footer', { align: 'center' })
    ]
  }
}

interface Ctx {
  sale: SaleReceipt
  settings: Record<string, string>
  branding: Branding
}

const sty = (el: ReceiptElement): string =>
  `style="${el.align ? `text-align:${el.align};` : ''}${el.bold ? 'font-weight:bold;' : ''}"`

function renderItems(sale: SaleReceipt): string {
  return sale.lines
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
}

function renderElement(el: ReceiptElement, ctx: Ctx): string {
  const { sale, settings, branding } = ctx
  switch (el.type) {
    case 'logo':
      return branding.logo_type === 'image' && branding.logo_value
        ? `<div ${sty(el)}><img src="${branding.logo_value}" style="max-height:18mm;max-width:100%;" /></div>`
        : ''
    case 'store_name':
      return `<div class="big" ${sty(el)}>${esc(settings.store_name || branding.app_name)}</div>`
    case 'store_address':
      return settings.store_address ? `<div class="muted" ${sty(el)}>${esc(settings.store_address)}</div>` : ''
    case 'header':
      return settings.receipt_header ? `<div class="muted" ${sty(el)}>${esc(settings.receipt_header)}</div>` : ''
    case 'footer':
      return settings.receipt_footer ? `<div class="muted" ${sty(el)}>${esc(settings.receipt_footer)}</div>` : ''
    case 'sale_info':
      return `<div class="row"><span>${esc(sale.sale_no)}</span><span>${formatDateTime(sale.datetime)}</span></div>`
    case 'cashier':
      return `<div class="row"><span>Cashier: ${esc(sale.cashier)}</span></div>`
    case 'customer':
      return sale.customer_name ? `<div class="row"><span>Customer: ${esc(sale.customer_name)}</span></div>` : ''
    case 'sd_info':
      return sale.sd_type
        ? `<div class="row"><span>${sale.sd_type === 'senior' ? 'Senior Citizen' : 'PWD'} ID: ${esc(sale.sd_id)}</span></div>
           ${sale.sd_name ? `<div class="row"><span>Name: ${esc(sale.sd_name)}</span></div>` : ''}`
        : ''
    case 'items':
      return renderItems(sale)
    case 'totals':
      return `<div class="row"><span>Subtotal</span><span>${formatPeso(sale.subtotal)}</span></div>
        ${sale.discount ? `<div class="row"><span>${sale.sd_type ? (sale.sd_type === 'senior' ? 'SC' : 'PWD') + ' Disc' : 'Discount'}</span><span>-${formatPeso(sale.discount)}</span></div>` : ''}
        ${sale.voucher_discount ? `<div class="row"><span>Voucher</span><span>-${formatPeso(sale.voucher_discount)}</span></div>` : ''}
        <div class="row total-row"><span>TOTAL</span><span>${formatPeso(sale.total)}</span></div>
        <div class="row muted"><span>VAT (incl.)</span><span>${formatPeso(sale.tax)}</span></div>`
    case 'payments':
      return (
        sale.payments
          .map(
            (p) =>
              `<div class="row"><span>${p.method.toUpperCase()}</span><span>${formatPeso(p.amount)}</span></div>`
          )
          .join('') +
        `<div class="row"><span>Tendered</span><span>${formatPeso(sale.amount_paid)}</span></div>`
      )
    case 'change':
      return `<div class="row big"><span>CHANGE</span><span>${formatPeso(sale.change)}</span></div>`
    case 'custom':
      return `<div ${sty(el)}>${esc(el.text ?? '')}</div>`
    case 'divider':
      return '<hr>'
    case 'spacer':
      return '<div>&nbsp;</div>'
    default:
      return ''
  }
}

function resolveTemplate(settings: Record<string, string>, override?: ReceiptTemplate): ReceiptTemplate {
  if (override) return override
  if (settings.receipt_template) {
    try {
      const t = JSON.parse(settings.receipt_template) as ReceiptTemplate
      if (t && Array.isArray(t.elements)) return t
    } catch {
      // fall through to default
    }
  }
  return defaultReceiptTemplate(Number(settings.receipt_width_mm || 80))
}

/**
 * Thermal receipt document for the silent print pipeline, rendered from a
 * configurable template (Settings → Receipt). The main process measures the
 * height and sizes @page to the content, so this only needs a printable width.
 */
export function buildReceiptHtml(
  sale: SaleReceipt,
  settings: Record<string, string>,
  branding: Branding,
  templateOverride?: ReceiptTemplate
): string {
  const template = resolveTemplate(settings, templateOverride)
  const widthMm = Number(template.width_mm || settings.receipt_width_mm || 80)
  const printableMm = widthMm - 8

  const voidBanner =
    sale.status === 'voided' ? '<div class="center big">*** VOIDED ***</div><hr>' : ''

  const body = template.elements
    .filter((el) => el.enabled)
    .map((el) => renderElement(el, { sale, settings, branding }))
    .join('')

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
  img { display: inline-block; }
  hr { border: none; border-top: 1px dashed #000; margin: 1.5mm 0; }
</style>
</head>
<body>
  ${voidBanner}
  ${body}
</body>
</html>`
}
