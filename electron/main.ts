import { app, BrowserWindow, Menu, shell } from 'electron'
import { join } from 'node:path'
import { initDatabase } from './db'
import { registerIpcHandlers } from './ipc'
import { applyStoredWindowIcon } from './ipc/branding'

// Dev/testing affordance: JJPOS_DEBUG_PORT=9222 npm run dev exposes the
// Chrome DevTools Protocol so tooling can drive the renderer. Never set in production.
if (process.env['JJPOS_DEBUG_PORT']) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env['JJPOS_DEBUG_PORT'])
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f3f4f6',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // POS terminal: never throttle when occluded — rAF-driven view transitions,
      // print jobs, and scanner timers must keep running with the window in back.
      backgroundThrottling: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // Apply a custom favicon (if any) to the taskbar/title icon.
  applyStoredWindowIcon(win)

  // Any external link opens in the OS browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // No default File/Edit menu — this is a kiosk-style POS app, and the menu's
  // Alt accelerator interferes with keyboard-first cashier workflows.
  Menu.setApplicationMenu(null)
  initDatabase()
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
