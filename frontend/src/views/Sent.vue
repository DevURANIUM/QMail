<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useEmailsStore } from '@/stores/emails';

const router = useRouter();
const store = useEmailsStore();
const search = ref('');
const filter = ref<'all' | 'starred'>('all');
const selectedIds = ref(new Set<string>());
const isActing = ref(false);
const actionError = ref('');

onMounted(() => store.fetchEmails('sent'));

const visibleEmails = computed(() => {
  const query = search.value.trim().toLocaleLowerCase();
  return store.sent.filter(email => {
    if (filter.value === 'starred' && !email.is_starred) return false;
    if (!query) return true;
    return [email.to_address, email.subject, email.body_text]
      .some(value => value?.toLocaleLowerCase().includes(query));
  });
});

const selectedCount = computed(() => selectedIds.value.size);
const allVisibleSelected = computed(() =>
  visibleEmails.value.length > 0 && visibleEmails.value.every(email => selectedIds.value.has(email.id)),
);

function formatDate(value: string) {
  const date = new Date(value);
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function openEmail(id: string) {
  if (selectedCount.value) toggleSelection(id);
  else router.push({ name: 'sent-email', params: { id } });
}

function toggleSelection(id: string) {
  const next = new Set(selectedIds.value);
  next.has(id) ? next.delete(id) : next.add(id);
  selectedIds.value = next;
}

function toggleSelectVisible() {
  const next = new Set(selectedIds.value);
  if (allVisibleSelected.value) visibleEmails.value.forEach(email => next.delete(email.id));
  else visibleEmails.value.forEach(email => next.add(email.id));
  selectedIds.value = next;
}

async function refresh() {
  actionError.value = '';
  selectedIds.value = new Set();
  await store.fetchEmails('sent');
}

async function deleteSelected() {
  const ids = [...selectedIds.value];
  if (!ids.length || isActing.value) return;
  if (!window.confirm(`Delete ${ids.length} sent message${ids.length > 1 ? 's' : ''}?`)) return;
  isActing.value = true;
  actionError.value = '';
  try {
    await store.bulkAction(ids, 'delete');
    selectedIds.value = new Set();
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : 'Failed to delete selected messages';
  } finally {
    isActing.value = false;
  }
}

async function setSelectedStarred(starred: boolean) {
  if (!selectedCount.value || isActing.value) return;
  const emails = store.sent.filter(email =>
    selectedIds.value.has(email.id) && Boolean(email.is_starred) !== starred,
  );
  if (!emails.length) return;
  isActing.value = true;
  actionError.value = '';
  try {
    await Promise.all(emails.map(email => store.toggleStar(email.id)));
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : 'Failed to update selected messages';
  } finally {
    isActing.value = false;
  }
}

async function toggleStar(event: Event, id: string) {
  event.stopPropagation();
  actionError.value = '';
  try {
    await store.toggleStar(id);
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : 'Failed to update message';
  }
}
</script>

<template>
  <div class="qm-page"><div class="qm-container">
    <div class="flex flex-wrap items-center justify-between gap-4 mb-5">
      <div>
        <p class="text-xs font-bold tracking-[.2em] uppercase text-primary-600">Outbox</p>
        <h1 class="qm-title mt-1">Sent messages</h1>
        <p class="mt-1 text-sm text-gray-500">{{ store.sent.length }} messages delivered from QMail</p>
      </div>
      <div class="flex items-center gap-2">
        <button @click="refresh" :disabled="store.isLoading" class="qm-button">
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9M20 20v-5h-.581m0 0a8.003 8.003 0 01-15.357-2" /></svg>
          Refresh
        </button>
        <router-link :to="{ name: 'compose' }" class="qm-button-primary">New message</router-link>
      </div>
    </div>

    <div class="flex flex-col gap-3 mb-4 sm:flex-row">
      <label class="sent-search flex-1">
        <span class="sr-only">Search sent messages</span>
        <svg aria-hidden="true" class="sent-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-width="2" d="m21 21-4.5-4.5m2.5-5.5a8 8 0 11-16 0 8 8 0 0116 0z" /></svg>
        <input v-model="search" type="search" class="qm-input sent-search-input" placeholder="Search recipient, subject or message…">
      </label>
      <div class="flex p-1 bg-gray-100 rounded-lg">
        <button v-for="option in (['all', 'starred'] as const)" :key="option" @click="filter = option" class="px-3 py-1.5 text-sm font-medium rounded-md capitalize" :class="filter === option ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600'">{{ option }}</button>
      </div>
    </div>

    <div v-if="actionError" class="p-3 mb-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl" role="alert">{{ actionError }}</div>

    <div v-if="selectedCount" class="selection-toolbar flex flex-wrap items-center gap-2 p-3 mb-3 border rounded-xl shadow-sm">
      <span class="selection-count mr-2 text-sm font-semibold">{{ selectedCount }} selected</span>
      <button @click="setSelectedStarred(true)" :disabled="isActing" class="toolbar-btn">Add star</button>
      <button @click="setSelectedStarred(false)" :disabled="isActing" class="toolbar-btn">Remove star</button>
      <button @click="deleteSelected" :disabled="isActing" class="bulk-delete px-3 py-1.5 text-sm font-medium text-red-700 bg-white border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50">Delete</button>
      <button @click="selectedIds = new Set()" class="clear-selection ml-auto px-3 py-1.5 text-sm font-medium rounded-md">Clear selection</button>
    </div>

    <div v-if="store.isLoading" class="flex justify-center py-24"><div class="spinner"></div></div>
    <div v-else-if="!visibleEmails.length" class="qm-card py-20 text-center">
      <div class="empty-icon">↗</div>
      <h2 class="mt-4 font-bold text-gray-900">{{ search || filter !== 'all' ? 'No matching messages' : 'No sent messages' }}</h2>
      <p class="mt-1 text-sm text-gray-500">{{ search || filter !== 'all' ? 'Try another search or filter.' : 'Messages you send will appear here.' }}</p>
    </div>
    <div v-else class="qm-card overflow-hidden">
      <div class="flex items-center px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <input type="checkbox" :checked="allVisibleSelected" @change="toggleSelectVisible" class="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" aria-label="Select all visible sent messages">
        <span class="ml-3 text-xs font-medium text-gray-500">Select all visible</span>
      </div>
      <ul class="divide-y divide-gray-200">
        <li v-for="email in visibleEmails" :key="email.id" @click="openEmail(email.id)" class="sent-row email-row" :class="{ 'is-selected': selectedIds.has(email.id) }">
          <input type="checkbox" :checked="selectedIds.has(email.id)" @click.stop @change="toggleSelection(email.id)" class="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" :aria-label="`Select ${email.subject || 'sent message'}`">
          <button @click="event => toggleStar(event, email.id)" class="text-gray-400 hover:text-yellow-500" :aria-label="email.is_starred ? 'Remove star' : 'Add star'">
            <svg class="w-5 h-5" :class="email.is_starred ? 'text-yellow-500' : ''" :fill="email.is_starred ? 'currentColor' : 'none'" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m12 2.7 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8L12 2.7z" /></svg>
          </button>
          <div class="sent-avatar hidden sm:flex">{{ email.to_address.charAt(0).toUpperCase() || '?' }}</div>
          <div class="min-w-0 flex-1">
            <div class="flex justify-between gap-3">
              <p class="text-sm font-semibold text-gray-900 truncate">To: {{ email.to_address }}</p>
              <time class="text-xs text-gray-400 flex-shrink-0">{{ formatDate(email.created_at) }}</time>
            </div>
            <p class="mt-0.5 text-sm text-gray-700 truncate">{{ email.subject || '(No subject)' }}</p>
            <p class="mt-0.5 text-xs text-gray-500 truncate">{{ email.body_text || 'HTML message' }}</p>
          </div>
        </li>
      </ul>
    </div>
  </div></div>
</template>

<style scoped>
.sent-search { @apply relative block; }
.sent-search-icon { @apply absolute z-10 w-5 h-5 text-gray-400 pointer-events-none left-4 top-1/2 -translate-y-1/2; }
.sent-search-input { padding-left: 3rem !important; }
.sent-row { @apply flex items-center gap-3 px-4 py-4 cursor-pointer transition-colors; }
.sent-avatar { @apply items-center justify-center flex-shrink-0 w-10 h-10 text-sm font-bold text-indigo-700 bg-indigo-100 rounded-xl; }
.empty-icon { @apply flex items-center justify-center w-12 h-12 mx-auto text-xl font-bold text-primary-600 bg-primary-100 rounded-2xl; }
.toolbar-btn { @apply px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50; }
.selection-toolbar { background: #eff6ff; border-color: #bfdbfe; }
.selection-count { color: #1e40af; }
.email-row { @apply transition-colors duration-150 hover:bg-gray-50; }
.email-row.is-selected { background: #eff6ff; }
.clear-selection { color: #64748b; }
</style>
