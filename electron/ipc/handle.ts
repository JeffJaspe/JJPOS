import { ipcMain } from 'electron'
import type { IpcResult } from '../../shared/types'

/**
 * Register an IPC handler that wraps its result in an IpcResult envelope.
 * Thrown errors become { ok: false, error } instead of Electron's noisy
 * "Error invoking remote method" wrapper; the preload unwraps and rethrows.
 */
export function handle<TPayload, TResult>(
  channel: string,
  fn: (payload: TPayload) => TResult | Promise<TResult>
): void {
  ipcMain.handle(channel, async (_event, payload: TPayload): Promise<IpcResult<TResult>> => {
    try {
      return { ok: true, data: await fn(payload) }
    } catch (err) {
      console.error(`[ipc] ${channel} failed:`, err)
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
