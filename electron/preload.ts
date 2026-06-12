import { contextBridge, ipcRenderer } from 'electron'
import type {
  Branding,
  Category,
  CustomerInput,
  CustomerListQuery,
  CustomerRow,
  IpcResult,
  ItemDetail,
  ItemInput,
  ItemListQuery,
  ItemRow,
  SessionUser,
  Supplier
} from '../shared/types'

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
  },
  items: {
    list: (query: ItemListQuery = {}) => invoke<ItemRow[]>('items:list', query),
    get: (id: number) => invoke<ItemDetail>('items:get', id),
    create: (input: ItemInput) => invoke<number>('items:create', input),
    update: (id: number, input: ItemInput) => invoke<true>('items:update', { id, input }),
    nextBarcode: () => invoke<string>('items:nextBarcode')
  },
  customers: {
    list: (query: CustomerListQuery = {}) => invoke<CustomerRow[]>('customers:list', query),
    create: (input: CustomerInput) => invoke<number>('customers:create', input),
    update: (id: number, input: CustomerInput) => invoke<true>('customers:update', { id, input })
  },
  categories: {
    list: () => invoke<Category[]>('categories:list'),
    create: (name: string) => invoke<number>('categories:create', name),
    update: (id: number, name: string) => invoke<true>('categories:update', { id, name }),
    remove: (id: number) => invoke<true>('categories:remove', id)
  },
  suppliers: {
    list: (includeInactive = false) => invoke<Supplier[]>('suppliers:list', { includeInactive }),
    create: (name: string, contact: string) => invoke<number>('suppliers:create', { name, contact }),
    update: (id: number, name: string, contact: string, active: number) =>
      invoke<true>('suppliers:update', { id, name, contact, active })
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
