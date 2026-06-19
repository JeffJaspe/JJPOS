import { onBeforeUnmount, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useCartStore } from '@/stores/cart'
import type { CartDraft } from '../../shared/types'

/** Debounce for autosaving the cart while the cashier is ringing items up. */
const AUTOSAVE_DELAY = 400

/**
 * Crash/power-off recovery for the active cart (PLAN §10.11). While signed in,
 * every cart change is autosaved to a local draft; the draft is cleared the
 * moment the cart empties (sale complete, hold, Clear cart) and on logout, so
 * only an *ungraceful* exit leaves one behind. On the next login the owning
 * cashier is offered it back.
 *
 * Lives in the shell (login-scoped lifecycle): the subscription tears down on
 * logout and re-arms — re-running the recovery check — on the next login.
 */
export function useCartPersistence() {
  const cart = useCartStore()
  const auth = useAuthStore()
  const recoveryDraft = ref<CartDraft | null>(null)

  let timer: ReturnType<typeof setTimeout> | undefined
  let stop: (() => void) | undefined
  // Hold autosave while the recovery prompt is open so it can't clear the draft
  // out from under the cashier before they decide.
  let paused = false

  function flush(): void {
    timer = undefined
    if (paused || !auth.isAuthenticated) return
    if (cart.isEmpty) {
      void window.api.cartDraft.clear().catch(() => {})
    } else {
      void window.api.cartDraft.save(cart.snapshot()).catch(() => {})
    }
  }

  function schedule(): void {
    if (paused || !auth.isAuthenticated) return
    clearTimeout(timer)
    // Emptying the cart clears the draft at once; saves are debounced.
    if (cart.isEmpty) flush()
    else timer = setTimeout(flush, AUTOSAVE_DELAY)
  }

  async function checkRecovery(): Promise<void> {
    if (!auth.isAuthenticated || !cart.isEmpty) return
    try {
      const draft = await window.api.cartDraft.load()
      if (draft) {
        recoveryDraft.value = draft
        paused = true
      }
    } catch {
      // Recovery is best-effort — never block login on it.
    }
  }

  function recoverDraft(): void {
    const draft = recoveryDraft.value
    if (draft) {
      try {
        cart.restore(draft.payload)
      } catch {
        // Corrupt payload — drop it rather than wedge the POS.
      }
    }
    recoveryDraft.value = null
    paused = false
    schedule() // re-persist the recovered cart under a fresh timestamp
  }

  function discardDraft(): void {
    recoveryDraft.value = null
    paused = false
    void window.api.cartDraft.clear().catch(() => {})
  }

  /**
   * Dismiss the prompt (Esc/backdrop) WITHOUT deleting — an accidental close
   * shouldn't lose an unfinished sale. Autosave resumes; the draft stays on disk
   * and is overwritten once a new sale starts, or re-offered after another crash.
   */
  function dismissRecovery(): void {
    recoveryDraft.value = null
    paused = false
    schedule()
  }

  async function start(): Promise<void> {
    // Check before subscribing so the first cart mutation can't pre-empt the prompt.
    await checkRecovery()
    stop = cart.$subscribe(() => schedule())
  }

  onBeforeUnmount(() => {
    clearTimeout(timer)
    stop?.()
  })

  return { recoveryDraft, recoverDraft, discardDraft, dismissRecovery, start }
}
