<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { BackupFile } from '../../../shared/types'
import { useToast } from '@/composables/useToast'

const toast = useToast()

const folder = ref('')
const backups = ref<BackupFile[]>([])
const loading = ref(false)
const busy = ref(false)
const error = ref('')

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(0)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

async function refresh(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    folder.value = await window.api.backup.getFolder()
    backups.value = await window.api.backup.list()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load backups'
  } finally {
    loading.value = false
  }
}

onMounted(refresh)

async function backupNow(): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await window.api.backup.now()
    toast.success('Backup created')
    await refresh()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Backup failed'
  } finally {
    busy.value = false
  }
}

async function changeFolder(): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const chosen = await window.api.backup.chooseFolder()
    if (chosen) {
      folder.value = chosen
      toast.success('Backup folder updated')
      await refresh()
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not set folder'
  } finally {
    busy.value = false
  }
}

async function saveCopy(): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const path = await window.api.backup.saveAs()
    if (path) toast.success('Copy saved')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Save failed'
  } finally {
    busy.value = false
  }
}

async function restore(file?: BackupFile): Promise<void> {
  if (busy.value) return
  const label = file ? `“${file.name}”` : 'a backup file you choose'
  const ok = window.confirm(
    `Restore from ${label}?\n\nThis REPLACES all current data — every sale, item, and ` +
      `customer reverts to the backup. A safety copy of the current database is saved first, ` +
      `and the app will restart.\n\nThis cannot be undone except by restoring the safety copy.`
  )
  if (!ok) return

  busy.value = true
  error.value = ''
  try {
    await window.api.backup.restore(file?.path)
    // On success the main process relaunches the app; this line rarely runs.
    toast.info('Restoring… the app will restart')
  } catch (err) {
    // "Restore cancelled" (file picker dismissed) shouldn't read as a failure.
    const msg = err instanceof Error ? err.message : 'Restore failed'
    if (msg !== 'Restore cancelled') error.value = msg
    busy.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl space-y-6">
    <!-- Folder + actions -->
    <section class="space-y-4">
      <h3 class="text-sm font-semibold text-gray-900">Database backup</h3>
      <p class="text-xs text-gray-500">
        The whole POS database is one file. Backups are written automatically once a day and when
        the app closes; the newest 14 are kept. You can also back up manually any time.
      </p>

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Backup folder</label>
        <div class="flex gap-2">
          <input
            :value="folder"
            type="text"
            readonly
            class="input flex-1 font-mono text-xs text-gray-600"
            title="Tip: point this at a USB drive or network share for off-machine safety"
          />
          <button class="btn-secondary whitespace-nowrap" :disabled="busy" @click="changeFolder">
            Change…
          </button>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <button class="btn-primary" :disabled="busy" @click="backupNow">
          {{ busy ? 'Working…' : 'Back up now' }}
        </button>
        <button class="btn-secondary" :disabled="busy" @click="saveCopy">Save copy to…</button>
        <button class="btn-secondary" :disabled="busy" @click="restore()">Restore from file…</button>
      </div>
    </section>

    <!-- Existing backups -->
    <section class="space-y-3 border-t border-gray-100 pt-5">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-gray-900">Recent backups</h3>
        <button class="text-xs text-accent hover:underline" :disabled="loading" @click="refresh">
          Refresh
        </button>
      </div>

      <p v-if="loading" class="text-sm text-gray-400">Loading…</p>
      <p v-else-if="!backups.length" class="text-sm text-gray-400">No backups yet.</p>

      <ul v-else class="divide-y divide-gray-100 rounded-lg border border-gray-200">
        <li v-for="b in backups" :key="b.path" class="flex items-center justify-between gap-3 px-3 py-2">
          <div class="min-w-0">
            <p class="truncate font-mono text-xs text-gray-700">{{ b.name }}</p>
            <p class="text-xs text-gray-400">{{ formatWhen(b.createdAt) }} · {{ formatSize(b.size) }}</p>
          </div>
          <button
            class="shrink-0 rounded-md px-3 py-1 text-xs font-medium text-red-600 transition-colors duration-100 hover:bg-red-50"
            :disabled="busy"
            @click="restore(b)"
          >
            Restore
          </button>
        </li>
      </ul>
    </section>

    <p v-if="error" class="text-sm text-red-600" role="alert">{{ error }}</p>
  </div>
</template>
