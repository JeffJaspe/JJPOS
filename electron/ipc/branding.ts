import { BrowserWindow, nativeImage } from 'electron'
import { getDb } from '../db'
import { handle } from './handle'
import { requirePermission } from './session'
import type { Branding } from '../../shared/types'

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** Set a window's taskbar/title icon from a data URL. Raster only — SVG yields an empty image. */
function applyWindowIcon(win: BrowserWindow | null, dataUrl: string): void {
  if (!win || !dataUrl) return
  try {
    const img = nativeImage.createFromDataURL(dataUrl)
    if (!img.isEmpty()) win.setIcon(img)
  } catch {
    // ignore — the HTML favicon still applies
  }
}

/** Apply the stored favicon to a window on startup. */
export function applyStoredWindowIcon(win: BrowserWindow): void {
  const row = getDb().prepare("SELECT value FROM branding WHERE key = 'favicon'").get() as
    | { value: string }
    | undefined
  if (row?.value) applyWindowIcon(win, row.value)
}

export function registerBrandingHandlers(): void {
  // No auth required: the login screen needs branding before anyone signs in.
  handle<void, Branding>('branding:get', () => {
    const rows = getDb().prepare('SELECT key, value FROM branding').all() as {
      key: string
      value: string
    }[]
    return Object.fromEntries(rows.map((r) => [r.key, r.value])) as unknown as Branding
  })

  handle<Branding, true>('branding:set', (input) => {
    const user = requirePermission('manage_branding')
    const db = getDb()

    const appName = input.app_name?.trim()
    if (!appName) throw new Error('App name is required')
    for (const [label, value] of [
      ['Primary color', input.accent_color],
      ['Secondary color', input.accent_color_2],
      ['Sidebar color', input.sidebar_color]
    ] as const) {
      if (!HEX_COLOR.test(value ?? '')) throw new Error(`${label} must be a hex value like #4f46e5`)
    }
    if (input.logo_type !== 'icon' && input.logo_type !== 'image') {
      throw new Error('Invalid logo type')
    }
    if (!input.logo_value) throw new Error('Pick a logo icon or image')
    if (input.logo_type === 'image' && !input.logo_value.startsWith('data:image/')) {
      throw new Error('Logo image must be an uploaded image')
    }
    const favicon = input.favicon ?? ''
    if (favicon && !favicon.startsWith('data:image/')) {
      throw new Error('Favicon must be an uploaded image')
    }

    const upsert = db.prepare(
      `INSERT INTO branding (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    db.transaction(() => {
      upsert.run('app_name', appName)
      upsert.run('accent_color', input.accent_color)
      upsert.run('accent_color_2', input.accent_color_2)
      upsert.run('sidebar_color', input.sidebar_color)
      upsert.run('logo_type', input.logo_type)
      upsert.run('logo_value', input.logo_value)
      upsert.run('favicon', favicon)
      db.prepare('INSERT INTO audit_log (user_id, action, detail) VALUES (?, ?, ?)').run(
        user.id,
        'branding_update',
        `Branding updated (${appName})`
      )
    })()
    // Live-update the window/taskbar icon (raster favicons only).
    applyWindowIcon(BrowserWindow.getFocusedWindow(), favicon)
    return true
  })
}
