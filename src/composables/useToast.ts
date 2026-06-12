import { reactive, readonly } from 'vue'

export interface Toast {
  id: number
  type: 'success' | 'error' | 'info'
  message: string
}

const toasts = reactive<Toast[]>([])
let nextId = 1

function show(type: Toast['type'], message: string): void {
  const id = nextId++
  toasts.push({ id, type, message })
  setTimeout(() => dismiss(id), 3000)
}

function dismiss(id: number): void {
  const index = toasts.findIndex((t) => t.id === id)
  if (index !== -1) toasts.splice(index, 1)
}

export function useToast() {
  return {
    toasts: readonly(toasts),
    dismiss,
    success: (message: string) => show('success', message),
    error: (message: string) => show('error', message),
    info: (message: string) => show('info', message)
  }
}
