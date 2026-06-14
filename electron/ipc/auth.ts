import bcrypt from 'bcryptjs'
import { getDb } from '../db'
import { handle } from './handle'
import { getSession, requireAuth, setSession } from './session'
import type { SessionUser } from '../../shared/types'

interface UserRow {
  id: number
  username: string
  full_name: string
  password_hash: string
  role_id: number
  role_name: string
  role_locked: number
}

export function registerAuthHandlers(): void {
  handle<{ username: string; password: string }, SessionUser>(
    'auth:login',
    ({ username, password }) => {
      const db = getDb()
      const row = db
        .prepare(
          `SELECT u.id, u.username, u.full_name, u.password_hash, u.role_id,
                  r.name AS role_name, r.locked AS role_locked
           FROM users u
           JOIN roles r ON r.id = u.role_id
           WHERE u.username = ? AND u.active = 1`
        )
        .get(username) as UserRow | undefined

      // Same message for unknown user and wrong password — don't leak which.
      if (!row || !bcrypt.compareSync(password, row.password_hash)) {
        throw new Error('Invalid username or password')
      }

      const menus = (
        db.prepare('SELECT menu_key FROM role_menus WHERE role_id = ?').all(row.role_id) as {
          menu_key: string
        }[]
      ).map((m) => m.menu_key)

      const permissions = (
        db
          .prepare('SELECT perm_key FROM role_permissions WHERE role_id = ?')
          .all(row.role_id) as { perm_key: string }[]
      ).map((p) => p.perm_key)

      const user: SessionUser = {
        id: row.id,
        username: row.username,
        fullName: row.full_name,
        roleId: row.role_id,
        roleName: row.role_name,
        isSuperAdmin: row.role_locked === 1,
        menus,
        permissions
      }

      setSession(user)
      db.prepare('INSERT INTO audit_log (user_id, action, detail) VALUES (?, ?, ?)').run(
        user.id,
        'login',
        `${user.username} signed in`
      )
      return user
    }
  )

  handle<void, true>('auth:logout', () => {
    const user = requireAuth()
    getDb()
      .prepare('INSERT INTO audit_log (user_id, action, detail) VALUES (?, ?, ?)')
      .run(user.id, 'logout', `${user.username} signed out`)
    setSession(null)
    return true
  })

  handle<void, SessionUser | null>('auth:getSession', () => getSession())

  /**
   * Verify a supervisor's credentials + a required permission for an inline
   * override (e.g. a cashier voiding a cart line without the `void` permission).
   * Does not change the session. Audit-logs the approval.
   */
  handle<{ username: string; password: string; permission: string; action: string }, { username: string }>(
    'auth:verifySupervisor',
    ({ username, password, permission, action }) => {
      const db = getDb()
      const actor = requireAuth()
      const sup = db
        .prepare('SELECT id, username, password_hash, role_id FROM users WHERE username = ? AND active = 1')
        .get(username) as
        | { id: number; username: string; password_hash: string; role_id: number }
        | undefined
      if (!sup || !bcrypt.compareSync(password, sup.password_hash)) {
        throw new Error('Invalid supervisor credentials')
      }
      const perms = (
        db.prepare('SELECT perm_key FROM role_permissions WHERE role_id = ?').all(sup.role_id) as {
          perm_key: string
        }[]
      ).map((p) => p.perm_key)
      if (!perms.includes(permission)) {
        throw new Error(`${sup.username} is not allowed to approve this`)
      }
      db.prepare('INSERT INTO audit_log (user_id, action, detail) VALUES (?, ?, ?)').run(
        sup.id,
        'override',
        `${action || 'override'} approved for ${actor.username}`
      )
      return { username: sup.username }
    }
  )
}
