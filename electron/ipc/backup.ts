import Database from 'better-sqlite3'
import { app, BrowserWindow, dialog } from 'electron'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync
} from 'node:fs'
import { join } from 'node:path'
import { closeDatabase, getDb, getDbPath } from '../db'
import type { BackupFile } from '../../shared/types'
import { handle } from './handle'
import { requirePermission } from './session'

const PREFIX = 'pos-backup-'
const EXT = '.db'

/** Read a single settings value (empty string if unset). */
function setting(key: string): string {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? ''
}

function setSetting(key: string, value: string): void {
  const info = getDb().prepare('UPDATE settings SET value = ? WHERE key = ?').run(value, key)
  if (info.changes === 0) {
    getDb().prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value)
  }
}

/** Configured backup folder, or the default userData/backups. Created if missing. */
export function resolveBackupDir(): string {
  const configured = setting('backup_folder').trim()
  const dir = configured || join(app.getPath('userData'), 'backups')
  mkdirSync(dir, { recursive: true })
  return dir
}

function retention(): number {
  const n = Number(setting('backup_retention'))
  return Number.isInteger(n) && n > 0 ? n : 14
}

/** Local date/time stamps (the app reports in local time; backups are named locally). */
function pad(n: number): string {
  return String(n).padStart(2, '0')
}
function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function stamp(d: Date): string {
  return `${localDate(d)}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function toBackupFile(dir: string, name: string): BackupFile {
  const path = join(dir, name)
  const st = statSync(path)
  return { name, path, size: st.size, createdAt: st.mtime.toISOString() }
}

/** Backups in a folder, newest first (timestamped names sort chronologically). */
function listBackups(dir: string): BackupFile[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith(EXT))
    .sort()
    .reverse()
    .map((name) => toBackupFile(dir, name))
}

/** Delete the oldest backups beyond the retention count. */
function prune(dir: string): void {
  const keep = retention()
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith(EXT))
    .sort() // oldest first
  for (const name of files.slice(0, Math.max(0, files.length - keep))) {
    try {
      rmSync(join(dir, name), { force: true })
    } catch {
      // best effort — a locked/removed file shouldn't fail the backup
    }
  }
}

/**
 * WAL-safe online backup of the live DB to `destPath`. better-sqlite3's
 * backup() copies a consistent snapshot even while the app keeps writing.
 */
async function onlineBackup(destPath: string): Promise<void> {
  await getDb().backup(destPath)
}

/** Validate that a file is a POS database (a real SQLite DB with our schema). */
function assertValidBackup(path: string): void {
  if (!existsSync(path)) throw new Error('Backup file not found')
  let probe: Database.Database | null = null
  try {
    probe = new Database(path, { readonly: true, fileMustExist: true })
    probe.pragma('schema_version') // throws if not a SQLite file
    const hasSchema = probe
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'migrations'")
      .get()
    if (!hasSchema) throw new Error("This file isn't a JJ POS backup")
  } catch (err) {
    if (err instanceof Error && /JJ POS backup/.test(err.message)) throw err
    throw new Error('That file is not a valid SQLite database')
  } finally {
    probe?.close()
  }
}

function parentWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

// ---------------------------------------------------------------------------
// Automatic backups (called from main.ts) — not IPC, no permission check.
// ---------------------------------------------------------------------------

/** Once-a-day backup: runs if no automatic backup has happened today. */
export async function maybeDailyBackup(): Promise<void> {
  const today = localDate(new Date())
  if (setting('backup_last_date') === today) return
  try {
    const dir = resolveBackupDir()
    await onlineBackup(join(dir, `${PREFIX}${stamp(new Date())}${EXT}`))
    prune(dir)
    setSetting('backup_last_date', today)
    console.log('[backup] daily backup written')
  } catch (err) {
    console.error('[backup] daily backup failed:', err)
  }
}

/**
 * Synchronous backup on app quit. The async backup() API can't reliably finish
 * during shutdown, so checkpoint the WAL into the main file and copy it — safe
 * because no other writes happen while quitting.
 */
export function backupOnQuitSync(): void {
  try {
    const db = getDb()
    db.pragma('wal_checkpoint(TRUNCATE)')
    const dir = resolveBackupDir()
    copyFileSync(getDbPath(), join(dir, `${PREFIX}${stamp(new Date())}${EXT}`))
    prune(dir)
    console.log('[backup] on-close backup written')
  } catch (err) {
    console.error('[backup] on-close backup failed:', err)
  }
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

export function registerBackupHandlers(): void {
  handle<void, BackupFile>('backup:now', async () => {
    requirePermission('manage_backup')
    const dir = resolveBackupDir()
    const name = `${PREFIX}${stamp(new Date())}${EXT}`
    await onlineBackup(join(dir, name))
    prune(dir)
    return toBackupFile(dir, name)
  })

  handle<void, BackupFile[]>('backup:list', () => {
    requirePermission('manage_backup')
    return listBackups(resolveBackupDir())
  })

  handle<void, string>('backup:getFolder', () => {
    requirePermission('manage_backup')
    return resolveBackupDir()
  })

  handle<void, string | null>('backup:chooseFolder', async () => {
    requirePermission('manage_backup')
    const win = parentWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: 'Choose backup folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || !res.filePaths[0]) return null
    setSetting('backup_folder', res.filePaths[0])
    return resolveBackupDir()
  })

  /** Save a one-off copy to any location the user picks (e.g. a USB drive). */
  handle<void, string | null>('backup:saveAs', async () => {
    requirePermission('manage_backup')
    const win = parentWindow()
    const res = await dialog.showSaveDialog(win!, {
      title: 'Save database copy',
      defaultPath: `${PREFIX}${stamp(new Date())}${EXT}`,
      filters: [{ name: 'SQLite database', extensions: ['db'] }]
    })
    if (res.canceled || !res.filePath) return null
    await onlineBackup(res.filePath)
    return res.filePath
  })

  /**
   * Restore a backup over the live database. DESTRUCTIVE: replaces all data.
   * A pre-restore safety snapshot of the current DB is taken first, then the
   * connection is closed, the file swapped, and the app relaunched.
   */
  handle<{ path?: string }, true>('backup:restore', async ({ path }) => {
    const user = requirePermission('manage_backup')

    let source = path
    if (!source) {
      const win = parentWindow()
      const res = await dialog.showOpenDialog(win!, {
        title: 'Restore from backup',
        properties: ['openFile'],
        filters: [{ name: 'SQLite database', extensions: ['db'] }]
      })
      if (res.canceled || !res.filePaths[0]) throw new Error('Restore cancelled')
      source = res.filePaths[0]
    }

    assertValidBackup(source)

    // Safety snapshot of the current data (records who restored, in case of regret).
    const dir = resolveBackupDir()
    getDb()
      .prepare('INSERT INTO audit_log (user_id, action, detail) VALUES (?, ?, ?)')
      .run(user.id, 'db_restore', `Restored from ${source}`)
    await onlineBackup(join(dir, `pos-prerestore-${stamp(new Date())}${EXT}`))

    const live = getDbPath()
    closeDatabase()
    copyFileSync(source, live)
    // Drop stale WAL/SHM sidecars so the restored file is read cleanly.
    rmSync(`${live}-wal`, { force: true })
    rmSync(`${live}-shm`, { force: true })

    app.relaunch()
    app.exit(0)
    return true as const
  })
}
