<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import api from '@/api/client';
import type { Contact } from '@/api/types';
import { avatarColor, avatarInitials } from '@/utils/avatar';

const router = useRouter();

const contacts = ref<Contact[]>([]);
const isLoading = ref(true);
const error = ref('');
const filter = ref('');

// New contact form
const newEmail = ref('');
const newName = ref('');
const newNotes = ref('');
const isSaving = ref(false);

// Inline editing
const editingId = ref<string | null>(null);
const editEmail = ref('');
const editName = ref('');
const editNotes = ref('');

const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase();
  if (!q) return contacts.value;
  return contacts.value.filter(c =>
    c.email.toLowerCase().includes(q) || (c.name || '').toLowerCase().includes(q)
  );
});

async function load() {
  isLoading.value = true;
  try {
    contacts.value = (await api.getContacts()).contacts;
  } catch {
    error.value = 'Failed to load contacts';
  } finally {
    isLoading.value = false;
  }
}

onMounted(load);

async function addContact() {
  error.value = '';
  if (!newEmail.value.trim()) {
    error.value = 'An email address is required';
    return;
  }

  isSaving.value = true;
  try {
    await api.saveContact({
      email: newEmail.value.trim(),
      name: newName.value.trim() || undefined,
      notes: newNotes.value.trim() || undefined,
    });
    newEmail.value = '';
    newName.value = '';
    newNotes.value = '';
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to save contact';
  } finally {
    isSaving.value = false;
  }
}

function startEdit(contact: Contact) {
  editingId.value = contact.id;
  editEmail.value = contact.email;
  editName.value = contact.name || '';
  editNotes.value = contact.notes || '';
}

async function saveEdit() {
  if (!editingId.value) return;
  error.value = '';
  try {
    await api.updateContact(editingId.value, {
      email: editEmail.value.trim(),
      name: editName.value.trim() || undefined,
      notes: editNotes.value.trim() || undefined,
    });
    editingId.value = null;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to update contact';
  }
}

async function removeContact(contact: Contact) {
  if (!confirm(`Delete ${contact.name || contact.email}?`)) return;
  await api.deleteContact(contact.id);
  await load();
}

function composeTo(contact: Contact) {
  router.push({ name: 'compose', query: { to: contact.email } });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr.includes('T') ? dateStr : `${dateStr.replace(' ', 'T')}Z`).toLocaleDateString();
}
</script>

<template>
  <div class="p-8 max-w-4xl">
    <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
      <h1 class="page-title">Contacts</h1>
      <input
        v-model="filter"
        type="search"
        placeholder="Filter contacts…"
        class="input !w-56"
      />
    </div>

    <div v-if="error" class="alert-error mb-6">{{ error }}</div>

    <!-- Add contact -->
    <form class="card p-4 mb-6" @submit.prevent="addContact">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <input v-model="newEmail" type="email" placeholder="email@example.com" class="input" required />
        <input v-model="newName" type="text" placeholder="Name (optional)" class="input" />
        <div class="flex gap-3">
          <input v-model="newNotes" type="text" placeholder="Notes (optional)" class="input flex-1" />
          <button type="submit" class="btn btn-primary flex-shrink-0" :disabled="isSaving">
            Add
          </button>
        </div>
      </div>
    </form>

    <!-- Loading -->
    <div v-if="isLoading" class="flex justify-center py-12">
      <div class="spinner"></div>
    </div>

    <!-- Empty -->
    <div v-else-if="contacts.length === 0" class="card text-center py-16">
      <svg class="mx-auto h-12 w-12 text-ink-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      <h3 class="mt-3 text-sm font-medium text-ink">No contacts yet</h3>
      <p class="mt-1 text-sm text-ink-3">People you send mail to are added automatically, or add one above.</p>
    </div>

    <!-- List -->
    <div v-else class="card overflow-hidden">
      <ul class="divide-y divide-edge">
        <li v-for="contact in filtered" :key="contact.id" class="group">
          <!-- Edit mode -->
          <div v-if="editingId === contact.id" class="p-4 bg-surface-2">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <input v-model="editEmail" type="email" class="input" required />
              <input v-model="editName" type="text" placeholder="Name" class="input" />
              <input v-model="editNotes" type="text" placeholder="Notes" class="input" />
            </div>
            <div class="flex gap-2 justify-end">
              <button class="btn btn-ghost !py-1" @click="editingId = null">Cancel</button>
              <button class="btn btn-primary !py-1" @click="saveEdit">Save</button>
            </div>
          </div>

          <!-- Display mode -->
          <div v-else class="px-4 py-3 flex items-center gap-3">
            <span
              class="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-medium select-none"
              :style="{ background: avatarColor(contact.email) }"
            >
              {{ avatarInitials(contact.name || contact.email) }}
            </span>

            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-ink truncate">
                {{ contact.name || contact.email.split('@')[0] }}
              </p>
              <p class="text-xs font-mono text-ink-3 truncate">{{ contact.email }}</p>
              <p v-if="contact.notes" class="text-xs text-ink-3 truncate mt-0.5">{{ contact.notes }}</p>
            </div>

            <span v-if="contact.last_contacted_at" class="text-xs text-ink-3 hidden sm:block flex-shrink-0">
              Last mailed {{ formatDate(contact.last_contacted_at) }}
            </span>

            <div class="flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0">
              <button class="btn-icon !p-1.5" title="Compose email" @click="composeTo(contact)">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button class="btn-icon !p-1.5" title="Edit" @click="startEdit(contact)">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
              <button class="btn-icon !p-1.5 hover:text-danger" title="Delete" @click="removeContact(contact)">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
