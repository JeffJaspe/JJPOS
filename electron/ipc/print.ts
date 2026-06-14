import { BrowserWindow } from 'electron'
import { getDb } from '../db'
import { handle } from './handle'
import { requireAuth } from './session'

/**
 * Printing pipeline: the renderer builds a self-contained HTML document with an
 * exact @page size (e.g. one 50×30mm label per page), and we render it in a
 * hidden window. printToPDF gives an exact preview; print() sends the job via
 * the system dialog so the user can pick the label/receipt printer.
 */
async function loadHidden(html: string): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    return win
  } catch (err) {
    win.destroy()
    throw err
  }
}

export function registerPrintHandlers(): void {
  /** Installed printers, so Settings can offer a receipt-printer dropdown. */
  handle<void, { name: string; displayName: string }[]>('print:listPrinters', async () => {
    requireAuth()
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return []
    const printers = await win.webContents.getPrintersAsync()
    return printers.map((p) => ({ name: p.name, displayName: p.displayName || p.name }))
  })

  /** Exact-page PDF of what will print, base64-encoded (for in-app preview). */
  handle<{ html: string }, string>('print:previewPdf', async ({ html }) => {
    requireAuth()
    const win = await loadHidden(html)
    try {
      const pdf = await win.webContents.printToPDF({
        preferCSSPageSize: true,
        printBackground: true
      })
      return pdf.toString('base64')
    } finally {
      win.destroy()
    }
  })

  /**
   * Send to a printer through the system dialog (user picks the device).
   * Resolves false when the user cancels — that is not an error.
   */
  handle<{ html: string }, boolean>('print:html', async ({ html }) => {
    requireAuth()
    const win = await loadHidden(html)
    return new Promise<boolean>((resolve, reject) => {
      win.webContents.print(
        { silent: false, printBackground: true, margins: { marginType: 'none' } },
        (success, failureReason) => {
          win.destroy()
          if (success) resolve(true)
          else if (!failureReason || /cancel/i.test(failureReason)) resolve(false)
          else reject(new Error(failureReason))
        }
      )
    })
  })

  /**
   * Receipt: prints silently to the configured receipt printer (or the system
   * default). The page height is measured from the content so thermal-roll
   * drivers cut right after the footer. Checkout never blocks on a dialog.
   */
  handle<{ html: string }, boolean>('print:receipt', async ({ html }) => {
    requireAuth()
    const db = getDb()
    const widthMm = Number(
      (db.prepare("SELECT value FROM settings WHERE key = 'receipt_width_mm'").get() as
        | { value: string }
        | undefined)?.value ?? 80
    )
    const printer = (
      db.prepare("SELECT value FROM settings WHERE key = 'receipt_printer'").get() as
        | { value: string }
        | undefined
    )?.value

    const win = await loadHidden(html)
    try {
      const heightPx = (await win.webContents.executeJavaScript(
        'document.body.scrollHeight'
      )) as number
      const heightMm = Math.ceil((heightPx * 25.4) / 96) + 4
      await win.webContents.executeJavaScript(
        `{ const s = document.createElement('style');
           s.textContent = '@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }';
           document.head.appendChild(s) }`
      )
      return await new Promise<boolean>((resolve, reject) => {
        win.webContents.print(
          {
            silent: true,
            printBackground: true,
            margins: { marginType: 'none' },
            ...(printer ? { deviceName: printer } : {})
          },
          (success, failureReason) => {
            win.destroy()
            if (success) resolve(true)
            else reject(new Error(failureReason || 'Receipt printer unavailable'))
          }
        )
      })
    } catch (err) {
      if (!win.isDestroyed()) win.destroy()
      throw err
    }
  })
}
