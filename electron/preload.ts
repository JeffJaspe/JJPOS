import { contextBridge, ipcRenderer } from 'electron'
import type { Branding, IpcResult, SessionUser } from '../shared/types'

/** Unwrap the IpcResult envelope so renderer callers get plain data or a thrown Error. */
async function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, payload)) as IpcResult<T>
  if (!result.ok) throw new Error(result.error)
  return result.data
}

const api = {
  auth: {
    login: (username: string, password: string) =>
      invoke<SessionUser>('auth:login', { username, password }),
    logout: () => invoke<true>('auth:logout'),
    getSession: () => invoke<SessionUser | null>('auth:getSession')
  },
  branding: {
    get: () => invoke<Branding>('branding:get')
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
