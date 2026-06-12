<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useToast } from '@/composables/useToast'
import { usePermissions } from '@/composables/usePermissions'
import type { Supplier } from '../../../shared/types'

const toast = useToast()
const { can } = usePermissions()
const canEdit = can('edit_items')

const suppliers = ref<Supplier[]>([])
const showInactive = ref(false)
const newName = ref('')
const newContact = ref('')
const editingId = ref<number | null>(null)
const editName = ref('')
const editContact = ref('')

async function load(): Promise<void> {
  suppliers.value = await window.api.suppliers.list(showInactive.value)
}
onMounted(load)

async function add(): Promise<void> {
  if (!newName.value.trim()) return
  try {
    await window.api.suppliers.create(newName.value, newContact.value)
    newName.value = ''
    newContact.value = ''
    await load()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Could not add supplier')
  }
}

function startEdit(supplier: Supplier): void {
  editingId.value = supplier.id
  editName.value = supplier.name
  editContact.value = supplier.contact
}

async function saveEdit(supplier: Supplier): Promise<void> {
  try {
    await window.api.suppliers.update(supplier.id, editName.value, editContact.value, supplier.active)
    editingId.value = null
    await load()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Could not save supplier')
  }
}

async function toggleActive(supplier: Supplier): Promise<void> {
  try {
    await window.api.suppliers.update(
      supplier.id,
      supplier.name,
      supplier.contact,
      supplier.active ? 0 : 1
    )
    await load()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Could not update supplier')
  }
}
</script>

<template>
  <div class="max-w-2xl space-y-3">
    <label class="flex items-center gap-2 text-sm text-gray-600">
      <input v-model="showInactive" type="checkbox" class="h-4 w-4 rounded" @change="load" />
      Show inactive
    </label>

    <div class="rounded-lg border border-gray-200 bg-white">
      <form v-if="canEdit" class="flex gap-2 border-b border-gray-200 p-3" @submit.prevent="add">
        <input v-model="newName" type="text" placeholder="Supplier name" class="input flex-1" />
        <input v-model="newContact" type="text" placeholder="Contact (optional)" class="input flex-1" />
        <button type="submit" class="btn-primary">Add</button>
      </form>

      <TransitionGroup name="rows" tag="ul" class="divide-y divide-gray-100">
        <li v-for="s in suppliers" :key="s.id" class="flex items-center gap-2 px-4 py-2.5">
          <template v-if="editingId === s.id">
            <input v-model="editName" type="text" class="input flex-1" />
            <input v-model="editContact" type="text" class="input flex-1" />
            <button class="btn-primary" @click="saveEdit(s)">Save</button>
            <button class="btn-secondary" @click="editingId = null">Cancel</button>
          </template>
          <template v-else>
            <div class="flex-1">
              <p class="text-sm text-gray-800" :class="{ 'line-through opacity-50': !s.active }">
                {{ s.name }}
              </p>
              <p v-if="s.contact" class="text-xs text-gray-500">{{ s.contact }}</p>
            </div>
            <template v-if="canEdit">
              <button
                class="text-sm font-medium text-accent transition-colors duration-100 hover:opacity-80"
                @click="startEdit(s)"
              >
                Edit
              </button>
              <button
                class="text-sm font-medium transition-colors duration-100"
                :class="s.active ? 'text-gray-500 hover:text-red-600' : 'text-green-600 hover:opacity-80'"
                @click="toggleActive(s)"
              >
                {{ s.active ? 'Deactivate' : 'Activate' }}
              </button>
            </template>
          </template>
        </li>
      </TransitionGroup>
      <p v-if="suppliers.length === 0" class="px-4 py-6 text-center text-sm text-gray-400">
        No suppliers yet.
      </p>
    </div>
  </div>
</template>
