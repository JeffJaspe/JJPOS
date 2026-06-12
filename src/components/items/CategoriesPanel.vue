<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import { useToast } from '@/composables/useToast'
import { usePermissions } from '@/composables/usePermissions'
import type { Category } from '../../../shared/types'

const emit = defineEmits<{ changed: [] }>()

const toast = useToast()
const { can } = usePermissions()
const canEdit = can('edit_items')

const categories = ref<Category[]>([])
const newName = ref('')
const editingId = ref<number | null>(null)
const editingName = ref('')

async function load(): Promise<void> {
  categories.value = await window.api.categories.list()
}
onMounted(load)

async function add(): Promise<void> {
  if (!newName.value.trim()) return
  try {
    await window.api.categories.create(newName.value)
    newName.value = ''
    await load()
    emit('changed')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Could not add category')
  }
}

function startEdit(category: Category): void {
  editingId.value = category.id
  editingName.value = category.name
}

async function saveEdit(): Promise<void> {
  if (editingId.value === null) return
  try {
    await window.api.categories.update(editingId.value, editingName.value)
    editingId.value = null
    await load()
    emit('changed')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Could not rename category')
  }
}

async function remove(category: Category): Promise<void> {
  try {
    await window.api.categories.remove(category.id)
    toast.success(`Deleted ${category.name}`)
    await load()
    emit('changed')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Could not delete category')
  }
}
</script>

<template>
  <div class="max-w-xl rounded-lg border border-gray-200 bg-white">
    <form v-if="canEdit" class="flex gap-2 border-b border-gray-200 p-3" @submit.prevent="add">
      <input v-model="newName" type="text" placeholder="New category name" class="input flex-1" />
      <button type="submit" class="btn-primary">Add</button>
    </form>

    <TransitionGroup name="rows" tag="ul" class="divide-y divide-gray-100">
      <li v-for="c in categories" :key="c.id" class="flex items-center gap-2 px-4 py-2.5">
        <template v-if="editingId === c.id">
          <input
            v-model="editingName"
            type="text"
            class="input flex-1"
            @keydown.enter.prevent="saveEdit"
            @keydown.esc="editingId = null"
          />
          <button class="btn-primary" @click="saveEdit">Save</button>
          <button class="btn-secondary" @click="editingId = null">Cancel</button>
        </template>
        <template v-else>
          <span class="flex-1 text-sm text-gray-800">{{ c.name }}</span>
          <template v-if="canEdit">
            <button
              class="text-sm font-medium text-accent transition-colors duration-100 hover:opacity-80"
              @click="startEdit(c)"
            >
              Rename
            </button>
            <button
              class="text-gray-400 transition-colors duration-100 hover:text-red-600"
              :aria-label="`Delete ${c.name}`"
              @click="remove(c)"
            >
              <AppIcon name="x-circle" class="h-4 w-4" />
            </button>
          </template>
        </template>
      </li>
    </TransitionGroup>
    <p v-if="categories.length === 0" class="px-4 py-6 text-center text-sm text-gray-400">
      No categories yet.
    </p>
  </div>
</template>
