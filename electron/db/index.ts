import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

let db: Database.Database | null = null

// Bundled at build time by Vite — adding a numbered .sql file to ./migrations is all
// that's needed for it to be picked up. Never edit an already-shipped migration.
const migrationFiles = import.meta.glob<string>('./migrations/*.sql', {
  eager: true,
  query: '?raw',
  import: 'default'
})

export function initDatabase(): Database.Database {
  const dataDir = join(app.getPath('userData'), 'data')
  mkdirSync(dataDir, { recursive: true })

  db = new Database(join(dataDir, 'pos.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  runMigrations(db)
  seedDefaultAdmin(db)
  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database has not been initialized')
  return db
}

function runMigrations(db: Database.Database): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS migrations (
       name TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`
  )

  const applied = new Set(
    (db.prepare('SELECT name FROM migrations').all() as { name: string }[]).map((r) => r.name)
  )

  for (const path of Object.keys(migrationFiles).sort()) {
    const name = path.split('/').pop()!
    if (applied.has(name)) continue

    db.transaction(() => {
      db.exec(migrationFiles[path])
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(name)
    })()
    console.log(`[db] applied migration ${name}`)
  }
}

/**
 * First-launch convenience: create a Super admin account when no users exist.
 * The password must be changed once user management lands (Phase 6).
 */
function seedDefaultAdmin(db: Database.Database): void {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }
  if (n > 0) return

  // Find the locked super role by its flag, not its name — the name can be
  // changed by a migration (004 renames it to "Superadmin").
  const role = db.prepare('SELECT id FROM roles WHERE locked = 1').get() as
    | { id: number }
    | undefined
  if (!role) throw new Error('Seed data missing: locked super-admin role not found')

  db.prepare(
    'INSERT INTO users (username, password_hash, full_name, role_id, active) VALUES (?, ?, ?, ?, 1)'
  ).run('admin', bcrypt.hashSync('admin123', 10), 'Administrator', role.id)
  console.log('[db] seeded default account admin/admin123 — change this password')
}
