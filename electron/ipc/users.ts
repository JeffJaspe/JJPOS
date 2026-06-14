import bcrypt from 'bcryptjs'
import { getDb } from '../db'
import { handle } from './handle'
import { requirePermission } from './session'
import type { UserCreateInput, UserRow, UserUpdateInput } from '../../shared/types'

const MIN_PASSWORD = 6

/** How many active users currently hold the locked Super admin role. */
function activeSuperAdminCount(): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.active = 1 AND r.locked = 1`
    )
    .get() as { n: number }
  return row.n
}

function isSuperAdminUser(userId: number): boolean {
  const row = getDb()
    .prepare(
      `SELECT r.locked AS locked
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.id = ?`
    )
    .get(userId) as { locked: number } | undefined
  return row?.locked === 1
}

function roleExists(roleId: number): boolean {
  return !!getDb().prepare('SELECT 1 FROM roles WHERE id = ?').get(roleId)
}

export function registerUserHandlers(): void {
  handle<void, UserRow[]>('users:list', () => {
    requirePermission('manage_users')
    return getDb()
      .prepare(
        `SELECT u.id, u.username, u.full_name, u.role_id, r.name AS role_name,
                u.active, u.created_at
         FROM users u JOIN roles r ON r.id = u.role_id
         ORDER BY u.username COLLATE NOCASE`
      )
      .all() as UserRow[]
  })

  handle<UserCreateInput, number>('users:create', (input) => {
    const actor = requirePermission('manage_users')
    const db = getDb()
    const username = input.username?.trim()
    if (!username) throw new Error('Username is required')
    if (!input.password || input.password.length < MIN_PASSWORD) {
      throw new Error(`Password must be at least ${MIN_PASSWORD} characters`)
    }
    if (!roleExists(input.role_id)) throw new Error('Pick a valid role')

    try {
      const info = db
        .prepare(
          `INSERT INTO users (username, password_hash, full_name, role_id, active)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(
          username,
          bcrypt.hashSync(input.password, 10),
          input.full_name?.trim() ?? '',
          input.role_id,
          input.active ? 1 : 0
        )
      db.prepare('INSERT INTO audit_log (user_id, action, detail) VALUES (?, ?, ?)').run(
        actor.id,
        'user_create',
        `Created user ${username}`
      )
      return Number(info.lastInsertRowid)
    } catch (err) {
      if (err instanceof Error && err.message.includes('UNIQUE')) {
        throw new Error('That username is already taken')
      }
      throw err
    }
  })

  handle<{ id: number; input: UserUpdateInput }, true>('users:update', ({ id, input }) => {
    const actor = requirePermission('manage_users')
    const db = getDb()
    const target = db.prepare('SELECT id, username FROM users WHERE id = ?').get(id) as
      | { id: number; username: string }
      | undefined
    if (!target) throw new Error('User not found')
    if (!roleExists(input.role_id)) throw new Error('Pick a valid role')

    const willBeActive = !!input.active
    const wasSuper = isSuperAdminUser(id)
    const willBeSuper = (
      db.prepare('SELECT locked FROM roles WHERE id = ?').get(input.role_id) as
        | { locked: number }
        | undefined
    )?.locked === 1

    if (id === actor.id && !willBeActive) throw new Error("You can't deactivate your own account")

    // Never strand the system without an active Superadmin.
    if (wasSuper && (!willBeActive || !willBeSuper) && activeSuperAdminCount() <= 1) {
      throw new Error('There must always be one active Superadmin')
    }

    db.prepare('UPDATE users SET full_name = ?, role_id = ?, active = ? WHERE id = ?').run(
      input.full_name?.trim() ?? '',
      input.role_id,
      willBeActive ? 1 : 0,
      id
    )
    db.prepare('INSERT INTO audit_log (user_id, action, detail) VALUES (?, ?, ?)').run(
      actor.id,
      'user_update',
      `Updated user ${target.username}`
    )
    return true
  })

  handle<{ id: number; password: string }, true>('users:setPassword', ({ id, password }) => {
    const actor = requirePermission('manage_users')
    const db = getDb()
    const target = db.prepare('SELECT username FROM users WHERE id = ?').get(id) as
      | { username: string }
      | undefined
    if (!target) throw new Error('User not found')
    if (!password || password.length < MIN_PASSWORD) {
      throw new Error(`Password must be at least ${MIN_PASSWORD} characters`)
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), id)
    db.prepare('INSERT INTO audit_log (user_id, action, detail) VALUES (?, ?, ?)').run(
      actor.id,
      'user_password_reset',
      `Reset password for ${target.username}`
    )
    return true
  })
}
