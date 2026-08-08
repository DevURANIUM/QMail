<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useEmailsStore } from '@/stores/emails';
import { displaySender, senderAddress, senderName } from '@/utils/email';

const router = useRouter();
const emailsStore = useEmailsStore();
const selectedIds = ref(new Set<string>());
const search = ref('');
const filter = ref<'all' | 'unread' | 'starred'>('all');
const isActing = ref(false);

onMounted(() => emailsStore.fetchEmails('received'));

const visibleEmails = computed(() => {
  const query = search.value.trim().toLocaleLowerCase();
  return emailsStore.inbox.filter(email => {
    if (filter.value === 'unread' && email.is_read) return false;
    if (filter.value === 'starred' && !email.is_starred) return false;
    if (!query) return true;
    return [displaySender(email), email.subject, email.body_text]
      .some(value => value?.toLocaleLowerCase().includes(query));
  });
});
const selectedCount = computed(() => selectedIds.value.size);
const allVisibleSelected = computed(() => visibleEmails.value.length > 0 && visibleEmails.value.every(e => selectedIds.value.has(e.id)));

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function openEmail(id: string) {
  if (!selectedCount.value) router.push({ name: 'email', params: { id } });
  else toggleSelection(id);
}

function toggleSelection(id: string) {
  const next = new Set(selectedIds.value);
  next.has(id) ? next.delete(id) : next.add(id);
  selectedIds.value = next;
}

function toggleSelectVisible() {
  const next = new Set(selectedIds.value);
  if (allVisibleSelected.value) visibleEmails.value.forEach(e => next.delete(e.id));
  else visibleEmails.value.forEach(e => next.add(e.id));
  selectedIds.value = next;
}

async function runBulk(action: 'read' | 'unread' | 'delete', ids = [...selectedIds.value]) {
  if (!ids.length || isActing.value) return;
  if (action === 'delete' && !window.confirm(`Delete ${ids.length} selected email${ids.length > 1 ? 's' : ''}?`)) return;
  isActing.value = true;
  try {
    await emailsStore.bulkAction(ids, action);
    selectedIds.value = new Set();
  } finally { isActing.value = false; }
}

async function markAllRead() {
  if (isActing.value) return;
  isActing.value = true;
  try { await emailsStore.markAllRead(); }
  finally { isActing.value = false; }
}

async function toggleStar(event: Event, id: string) {
  event.stopPropagation();
  await emailsStore.toggleStar(id);
}
</script>

<template>
  <div class="qm-page"><div class="qm-container">
    <div class="flex flex-wrap items-center justify-between gap-4 mb-5">
      <div><p class="text-xs font-bold tracking-[.2em] uppercase text-primary-600">Messages</p>
        <h1 class="qm-title mt-1">Inbox</h1>
        <p class="mt-1 text-sm text-gray-500">{{ emailsStore.stats.unread }} unread · {{ emailsStore.inbox.length }} messages</p>
      </div>
      <div class="flex items-center gap-2">
        <button v-if="emailsStore.stats.unread" @click="markAllRead" :disabled="isActing" class="px-3 py-2 text-sm font-medium text-primary-700 bg-primary-50 rounded-lg hover:bg-primary-100 disabled:opacity-50">Mark all read</button>
        <button @click="emailsStore.fetchEmails('received')" class="qm-button">
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9M20 20v-5h-.581m0 0a8.003 8.003 0 01-15.357-2" /></svg>
          Refresh
        </button>
      </div>
    </div>

    <div class="flex flex-col sm:flex-row gap-3 mb-4">
      <label class="relative flex-1">
        <span class="sr-only">Search emails</span>
        <svg class="absolute w-5 h-5 text-gray-400 left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m21 21-4.35-4.35m2.35-5.65a8 8 0 11-16 0 8 8 0 0116 0z" /></svg>
        <input v-model="search" type="search" placeholder="Search sender, subject or message…" class="w-full py-2 pl-10 pr-3 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
      </label>
      <div class="flex p-1 bg-gray-100 rounded-lg">
        <button v-for="option in (['all', 'unread', 'starred'] as const)" :key="option" @click="filter = option" class="px-3 py-1.5 text-sm font-medium rounded-md capitalize" :class="filter === option ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-600'">{{ option }}</button>
      </div>
    </div>

    <div v-if="selectedCount" class="selection-toolbar flex flex-wrap items-center gap-2 p-3 mb-3 border rounded-xl shadow-sm">
      <span class="selection-count mr-2 text-sm font-semibold">{{ selectedCount }} selected</span>
      <button @click="runBulk('read')" :disabled="isActing" class="toolbar-btn">Mark read</button>
      <button @click="runBulk('unread')" :disabled="isActing" class="toolbar-btn">Mark unread</button>
      <button @click="runBulk('delete')" :disabled="isActing" class="bulk-delete px-3 py-1.5 text-sm font-medium text-red-700 bg-white border border-red-200 rounded-md hover:bg-red-50">Delete</button>
      <button @click="selectedIds = new Set()" class="clear-selection ml-auto px-3 py-1.5 text-sm font-medium rounded-md">Clear selection</button>
    </div>

    <div v-if="emailsStore.isLoading" class="flex justify-center py-12"><div class="spinner"></div></div>
    <div v-else-if="visibleEmails.length === 0" class="qm-card py-14 text-center">
      <svg class="w-12 h-12 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5" /></svg>
      <h3 class="mt-3 text-sm font-medium text-gray-900">No matching emails</h3>
      <p class="mt-1 text-sm text-gray-500">Try another search or filter.</p>
    </div>
    <div v-else class="qm-card overflow-hidden">
      <div class="flex items-center px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <input type="checkbox" :checked="allVisibleSelected" @change="toggleSelectVisible" class="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" aria-label="Select all visible emails" />
        <span class="ml-3 text-xs font-medium text-gray-500">Select all visible</span>
      </div>
      <ul class="divide-y divide-gray-200">
        <li v-for="email in visibleEmails" :key="email.id" @click="openEmail(email.id)" class="email-row cursor-pointer" :class="{ 'is-selected': selectedIds.has(email.id), 'is-unread': !email.is_read }">
          <div class="flex items-center px-4 py-3.5">
            <input type="checkbox" :checked="selectedIds.has(email.id)" @click.stop @change="toggleSelection(email.id)" class="w-4 h-4 mr-3 rounded border-gray-300 text-primary-600 focus:ring-primary-500" :aria-label="`Select ${email.subject || 'email'}`" />
            <button @click="event => toggleStar(event, email.id)" class="mr-3 text-gray-400 hover:text-yellow-500" :aria-label="email.is_starred ? 'Remove star' : 'Add star'">
              <svg class="w-5 h-5" :class="email.is_starred ? 'text-yellow-500' : ''" :fill="email.is_starred ? 'currentColor' : 'none'" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m12 2.7 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8L12 2.7z" /></svg>
            </button>
            <span class="w-2 h-2 mr-3 rounded-full flex-shrink-0" :class="email.is_read ? 'bg-transparent' : 'bg-primary-500'"></span>
            <div class="sender-avatar mr-3 hidden sm:flex" aria-hidden="true">{{ senderName(email).charAt(0).toUpperCase() }}</div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-baseline min-w-0 gap-2">
                  <p class="text-sm truncate" :class="email.is_read ? 'text-gray-600' : 'font-semibold text-gray-900'">{{ senderName(email) }}</p>
                  <span class="hidden text-xs text-gray-400 truncate lg:inline">{{ senderAddress(email) }}</span>
                </div>
                <time class="text-xs text-gray-500 flex-shrink-0">{{ formatDate(email.created_at) }}</time>
              </div>
              <p class="text-sm truncate" :class="email.is_read ? 'text-gray-500' : 'font-medium text-gray-900'">{{ email.subject || '(No Subject)' }}</p>
              <p class="text-sm text-gray-500 truncate">{{ email.body_text?.substring(0, 140) || 'No preview available' }}</p>
            </div>
          </div>
        </li>
      </ul>
    </div></div>
  </div>
</template>

<style scoped>
.toolbar-btn { @apply px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50; }
.selection-toolbar { background: #eff6ff; border-color: #bfdbfe; }
.selection-count { color: #1e40af; }
.email-row { @apply transition-colors duration-150 hover:bg-gray-50; }
.email-row.is-unread { box-shadow: inset 3px 0 0 #3b82f6; }
.email-row.is-selected { background: #eff6ff; }
.sender-avatar { @apply w-9 h-9 flex-shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-sm font-bold; }
.clear-selection { color:#64748b; }
</style>
