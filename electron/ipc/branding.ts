import { getDb } from '../db'
import { handle } from './handle'
import type { Branding } from '../../shared/types'

export function registerBrandingHandlers(): void {
  // No auth required: the login screen needs branding before anyone signs in.
  handle<void, Branding>('branding:get', () => {
    const rows = getDb().prepare('SELECT key, value FROM branding').all() as {
      key: string
      value: string
    }[]
    return Object.fromEntries(rows.map((r) => [r.key, r.value])) as unknown as Branding
  })
}
