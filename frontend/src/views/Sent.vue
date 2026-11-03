<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useEmailsStore } from '@/stores/emails';
import api from '@/api/client';
import type { Email } from '@/api/types';
import EmailList from '@/components/EmailList.vue';

const router = useRouter();
const route = useRoute();
const emailsStore = useEmailsStore();
const searchQuery = ref(typeof route.query.q === 'string' ? route.query.q : '');
const activeQuery = ref('');
const searchResults = ref<Email[] | null>(null);
const isSearching = ref(false);
const error = ref('');
const selectedIds = ref<string[]>([]);
const isDeleting = ref(false);
const pendingIds = ref<string[]>([]);
const deleteDialog = ref<HTMLDialogElement | null>(null);
let searchVersion = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(searchQuery, query => {
  clearTimeout(searchTimer);
  ++searchVersion;
  if (!query.trim()) { clearSearch(); return; }
  isSearching.value = true;
  searchTimer = setTimeout(runSearch, 300);
}, { flush: 'sync' });
onUnmounted(() => { clearTimeout(searchTimer); ++searchVersion; });
const emails = computed(() => searchResults.value ?? emailsStore.sent);
const allSelected = computed(() => emails.value.length > 0 && selectedIds.value.length === emails.value.length);
watch(emails, () => {
  const visible = new Set(emails.value.map(email => email.id));
  selectedIds.value = selectedIds.value.filter(id => visible.has(id));
});

onMounted(async () => { await refresh(); });

async function refresh() {
  error.value = '';
  try {
    await emailsStore.fetchEmails('sent');
    if (searchQuery.value.trim()) await runSearch();
  } catch (e) { error.value = e instanceof Error ? e.message : 'Could not load sent mail'; }
}
async function runSearch() {
  clearTimeout(searchTimer);
  const query = searchQuery.value.trim();
  if (!query) { clearSearch(); return; }
  const version = ++searchVersion;
  isSearching.value = true;
  error.value = '';
  try {
    const result = await api.searchEmails(query, 'sent');
    if (version !== searchVersion) return;
    searchResults.value = result.emails;
    activeQuery.value = query;
    selectedIds.value = [];
    await router.replace({ query: { ...route.query, q: query } });
  } catch (e) {
    if (version === searchVersion) error.value = e instanceof Error ? e.message : 'Search failed';
  } finally { if (version === searchVersion) isSearching.value = false; }
}
function clearSearch() {
  clearTimeout(searchTimer);
  ++searchVersion;
  isSearching.value = false;
  searchQuery.value = '';
  activeQuery.value = '';
  searchResults.value = null;
  selectedIds.value = [];
  error.value = '';
  const query = { ...route.query }; delete query.q;
  router.replace({ query });
}
function openEmail(id: string) { router.push({ name: 'sent-email', params: { id } }); }
function composeFrom(id: string, action: 'replyTo' | 'forward') {
  router.push({ name: 'compose', query: { [action]: id } });
}
function toggleSelection(id: string) {
  if (isDeleting.value) return;
  selectedIds.value = selectedIds.value.includes(id) ? selectedIds.value.filter(value => value !== id) : [...selectedIds.value, id];
}
function toggleAll() { selectedIds.value = allSelected.value ? [] : emails.value.map(email => email.id); }
function requestDelete(ids: string[]) {
  if (isDeleting.value || isSearching.value || ids.length === 0) return;
  pendingIds.value = [...ids];
  deleteDialog.value?.showModal();
}
async function confirmDelete() {
  if (isDeleting.value) return;
  isDeleting.value = true;
  error.value = '';
  try {
    const result = await emailsStore.deleteEmails(pendingIds.value);
    const removed = new Set(result.deleted);
    if (searchResults.value) searchResults.value = searchResults.value.filter(email => !removed.has(email.id));
    selectedIds.value = selectedIds.value.filter(id => !removed.has(id));
    if (result.failed.length) error.value = `${result.failed.length} message(s) could not be deleted. Please try again.`;
  } catch (e) { error.value = e instanceof Error ? e.message : 'Delete failed'; }
  finally {
    isDeleting.value = false;
    deleteDialog.value?.close();
    pendingIds.value = [];
  }
}
</script>

<template>
  <div class="p-8 max-w-6xl">
    <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
      <h1 class="page-title">Sent</h1>
      <router-link :to="{ name: 'compose' }" class="btn btn-primary">Compose email</router-link>
    </div>
    <form class="flex flex-wrap items-center gap-2 mb-4" @submit.prevent="runSearch">
      <label for="sent-search" class="sr-only">Search sent mail</label>
      <input id="sent-search" v-model="searchQuery" type="search" placeholder="Search sent mail..." class="input flex-1 min-w-0" :disabled="isDeleting" @keyup.esc="clearSearch" />
      <span v-if="isSearching" role="status" class="text-xs text-ink-3">Searching...</span>
      <button type="button" class="btn btn-ghost" :disabled="isDeleting || isSearching || emailsStore.isLoading" @click="refresh">Refresh</button>
    </form>
    <div v-if="searchResults !== null" class="flex flex-wrap items-center justify-between gap-2 mb-4 text-sm">
      <p role="status" class="text-ink-2">{{ emails.length }} result(s) for "{{ activeQuery }}"</p>
      <button type="button" class="text-accent" :disabled="isDeleting" @click="clearSearch">Back to sent</button>
    </div>
    <p v-if="error" role="alert" class="alert-error mb-4">{{ error }}</p>
    <div v-if="emailsStore.isLoading" class="flex justify-center py-12" role="status" aria-label="Loading messages"><div class="spinner"></div></div>
    <div v-else-if="emails.length === 0" class="card text-center py-16">
      <h2 class="text-sm font-medium text-ink">{{ searchResults !== null ? 'No matches' : 'Nothing sent yet' }}</h2>
      <p class="mt-1 text-sm text-ink-3">{{ searchResults !== null ? 'Search covers subjects, bodies, and addresses in sent mail.' : 'Messages you send will appear here.' }}</p>
    </div>
    <div v-else class="card overflow-hidden" :aria-busy="isDeleting">
      <div class="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-edge">
        <label class="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" class="h-4 w-4 accent-accent" :checked="allSelected" :indeterminate="selectedIds.length > 0 && !allSelected" :disabled="isDeleting || isSearching" @change="toggleAll" />
          Select all shown
        </label>
        <span role="status" class="text-xs text-ink-3">{{ selectedIds.length }} selected</span>
        <button v-if="selectedIds.length" type="button" class="btn btn-danger ml-auto" :disabled="isDeleting || isSearching" @click="requestDelete(selectedIds)">{{ isDeleting ? 'Deleting...' : 'Delete selected' }}</button>
      </div>
      <EmailList :emails="emails" variant="sent" selectable message-actions :selected-ids="selectedIds" :busy="isDeleting || isSearching"
        @open="openEmail" @delete="id => requestDelete([id])" @toggle-selection="toggleSelection"
        @reply="id => composeFrom(id, 'replyTo')" @forward="id => composeFrom(id, 'forward')" />
    </div>
    <dialog ref="deleteDialog" class="w-full max-w-md rounded-2xl border border-edge bg-surface p-6 text-ink shadow-pop backdrop:bg-black/50" aria-labelledby="delete-title" aria-describedby="delete-description" @cancel="isDeleting && $event.preventDefault()">
      <h2 id="delete-title" class="text-lg font-semibold">Delete {{ pendingIds.length }} message(s)?</h2>
      <p id="delete-description" class="mt-2 text-sm text-ink-2">This permanently removes the selected messages and their attachments from Qmail.</p>
      <div class="mt-6 flex justify-end gap-2">
        <button type="button" class="btn btn-ghost" autofocus :disabled="isDeleting" @click="deleteDialog?.close()">Cancel</button>
        <button type="button" class="btn btn-danger" :disabled="isDeleting" @click="confirmDelete">{{ isDeleting ? 'Deleting...' : 'Delete' }}</button>
      </div>
    </dialog>
  </div>
</template>
