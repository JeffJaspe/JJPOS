import { BrowserWindow } from 'electron'
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
}
