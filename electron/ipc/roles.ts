import { getDb } from '../db'
import { handle } from './handle'
import { requirePermission, requireSuperAdmin } from './session'
import { MENU_KEYS, PERM_KEYS } from '../../shared/types'
import type { RoleInput, RoleRow } from '../../shared/types'

const MENU_SET = new Set<string>(MENU_KEYS)
const PERM_SET = new Set<string>(PERM_KEYS)

/** Keep only known keys — the renderer can't smuggle in arbitrary menu/perm strings. */
function sanitize(values: string[], allowed: Set<string>): string[] {
  return [...new Set((values ?? []).filter((v) => allowed.has(v)))]
}

function writeRoleKeys(roleId: number, menus: string[], permissions: string[]): void {
  const db = getDb()
  db.prepare('DELETE FROM role_menus WHERE role_id = ?').run(roleId)
  db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(roleId)
  const insMenu = db.prepare('INSERT INTO role_menus (role_id, menu_key) VALUES (?, ?)')
  const insPerm = db.prepare('INSERT INTO role_permissions (role_id, perm_key) VALUES (?, ?)')
  for (const m of menus) insMenu.run(roleId, m)
  for (const p of permissions) insPerm.run(roleId, p)
}

export function registerRoleHandlers(): void {
  // Listing is needed by the Users tab (role dropdown), so manage_users is enough.
  handle<void, RoleRow[]>('roles:list', () => {
    requirePermission('manage_users')
    const db = getDb()
    const roles = db
      .prepare(
        `SELECT r.id, r.name, r.is_system, r.locked,
                (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) AS user_count
         FROM roles r ORDER BY r.id`
      )
      .all() as Omit<RoleRow, 'menus' | 'permissions'>[]

    return roles.map((r) => ({
      ...r,
      menus: (
        db.prepare('SELECT menu_key FROM role_menus WHERE role_id = ?').all(r.id) as {
          menu_key: string
        }[]
      ).map((m) => m.menu_key),
      permissions: (
        db.prepare('SELECT perm_key FROM role_permissions WHERE role_id = ?').all(r.id) as {
          perm_key: string
        }[]
      ).map((p) => p.perm_key)
    }))
  })

  handle<RoleInput, number>('roles:create', (input) => {
    const actor = requireSuperAdmin()
    const db = getDb()
    const name = input.name?.trim()
    if (!name) throw new Error('Role name is required')
    const menus = sanitize(input.menus, MENU_SET)
    const permissions = sanitize(input.permissions, PERM_SET)

    return db.transaction(() => {
      let roleId: number
      try {
        const info = db
          .prepare('INSERT INTO roles (name, is_system, locked) VALUES (?, 0, 0)')
          .run(name)
        roleId = Number(info.lastInsertRowid)
      } catch (err) {
        if (err instanceof Error && err.message.includes('UNIQUE')) {
          throw new Error('A role with that name already exists')
        }
        throw err
      }
      writeRoleKeys(roleId, menus, permissions)
      db.prepare('INSERT INTO audit_log (user_id, action, detail) VALUES (?, ?, ?)').run(
        actor.id,
        'role_create',
        `Created role ${name}`
      )
      return roleId
    })()
  })

  handle<{ id: number; input: RoleInput }, true>('roles:update', ({ id, input }) => {
    const actor = requireSuperAdmin()
    const db = getDb()
    const role = db.prepare('SELECT id, name, locked FROM roles WHERE id = ?').get(id) as
      | { id: number; name: string; locked: number }
      | undefined
    if (!role) throw new Error('Role not found')
    if (role.locked) throw new Error('The Superadmin role is locked and cannot be edited')

    const name = input.name?.trim()
    if (!name) throw new Error('Role name is required')
    const menus = sanitize(input.menus, MENU_SET)
    const permissions = sanitize(input.permissions, PERM_SET)

    db.transaction(() => {
      try {
        db.prepare('UPDATE roles SET name = ? WHERE id = ?').run(name, id)
      } catch (err) {
        if (err instanceof Error && err.message.includes('UNIQUE')) {
          throw new Error('A role with that name already exists')
        }
        throw err
      }
      writeRoleKeys(id, menus, permissions)
      db.prepare('INSERT INTO audit_log (user_id, action, detail) VALUES (?, ?, ?)').run(
        actor.id,
        'role_update',
        `Updated role ${name}`
      )
    })()
    return true
  })

  handle<number, true>('roles:delete', (id) => {
    const actor = requireSuperAdmin()
    const db = getDb()
    const role = db.prepare('SELECT id, name, is_system, locked FROM roles WHERE id = ?').get(id) as
      | { id: number; name: string; is_system: number; locked: number }
      | undefined
    if (!role) throw new Error('Role not found')
    if (role.locked || role.is_system) throw new Error('Built-in roles cannot be deleted')

    const { n } = db
      .prepare('SELECT COUNT(*) AS n FROM users WHERE role_id = ?')
      .get(id) as { n: number }
    if (n > 0) throw new Error(`Reassign the ${n} user(s) on this role before deleting it`)

    // role_menus / role_permissions cascade on delete (see migration 001).
    db.prepare('DELETE FROM roles WHERE id = ?').run(id)
    db.prepare('INSERT INTO audit_log (user_id, action, detail) VALUES (?, ?, ?)').run(
      actor.id,
      'role_delete',
      `Deleted role ${role.name}`
    )
    return true
  })
}
