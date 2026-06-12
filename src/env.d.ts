/// <reference types="vite/client" />

import type { Api } from '../electron/preload'

declare global {
  interface Window {
    /** IPC surface exposed by the preload script. */
    api: Api
  }
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

export {}
