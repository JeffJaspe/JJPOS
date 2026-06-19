import { app } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CartDraft } from '../../shared/types'
import { handle } from './handle'
import { requireAuth } from './session'

/**
 * Local cart-draft persistence for crash/power-off recovery (PLAN §10.11).
 * A small JSON file in userData — deliberately NOT the DB, so a draft survives
 * even when the DB is gone (a future Client station has none) and across an
 * ungraceful shutdown. Tagged with the cashier so only its owner recovers it.
 */
function draftPath(): string {
  return join(app.getPath('userData'), 'cart-draft.json')
}

function readDraft(): CartDraft | null {
  const path = draftPath()
  if (!existsSync(path)) return null
  try {
    const draft = JSON.parse(readFileSync(path, 'utf-8')) as CartDraft
    if (typeof draft?.userId !== 'number' || typeof draft?.payload !== 'string') return null
    return draft
  } catch {
    // A corrupt/partial draft (e.g. interrupted write) is unrecoverable — drop it.
    return null
  }
}

export function clearCartDraft(): void {
  rmSync(draftPath(), { force: true })
}

export function registerCartDraftHandlers(): void {
  /** Autosave the active cart. Only ever called while signed in. */
  handle<{ payload: string }, true>('cartDraft:save', ({ payload }) => {
    const user = requireAuth()
    const draft: CartDraft = {
      userId: user.id,
      userName: user.fullName || user.username,
      savedAt: new Date().toISOString(),
      payload
    }
    writeFileSync(draftPath(), JSON.stringify(draft), 'utf-8')
    return true as const
  })

  /** The current draft, but only if it belongs to the signed-in cashier. */
  handle<void, CartDraft | null>('cartDraft:load', () => {
    const user = requireAuth()
    const draft = readDraft()
    return draft && draft.userId === user.id ? draft : null
  })

  handle<void, true>('cartDraft:clear', () => {
    requireAuth()
    clearCartDraft()
    return true as const
  })
}
