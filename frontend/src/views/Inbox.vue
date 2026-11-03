<script setup lang="ts">
import { onMounted, onUnmounted, computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useEmailsStore } from '@/stores/emails';
import api from '@/api/client';
import type { Email } from '@/api/types';
import EmailList from '@/components/EmailList.vue';

const router = useRouter();
const emailsStore = useEmailsStore();

const searchQuery = ref('');
const activeQuery = ref('');
const searchResults = ref<Email[] | null>(null);
const isSearching = ref(false);
const error = ref('');
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

onMounted(async () => {
  await emailsStore.fetchEmails('received');
});

const emails = computed(() => emailsStore.inbox);

function openEmail(id: string) {
  const fromSearch = searchResults.value?.find(e => e.id === id);
  router.push({ name: fromSearch?.type === 'sent' ? 'sent-email' : 'email', params: { id } });
}

async function toggleStar(id: string) {
  const result = searchResults.value?.find(email => email.id === id);
  const starred = result?.is_starred === 1;
  await emailsStore.toggleStar(id);
  if (result) result.is_starred = starred ? 0 : 1;
}

async function toggleRead(id: string) {
  const email = searchResults.value?.find(e => e.id === id) || emailsStore.emails.find(e => e.id === id);
  const wasRead = email?.is_read === 1;
  if (wasRead) {
    await emailsStore.markAsUnread(id);
  } else {
    await emailsStore.markAsRead(id);
  }
  if (email) email.is_read = wasRead ? 0 : 1;
}

async function archiveEmail(id: string) {
  await api.archiveEmail(id);
  emailsStore.emails = emailsStore.emails.filter(e => e.id !== id);
  if (searchResults.value) searchResults.value = searchResults.value.filter(email => email.id !== id);
  await emailsStore.fetchStats();
}

async function deleteEmail(id: string) {
  error.value = '';
  try {
    await emailsStore.deleteEmail(id);
    if (searchResults.value) searchResults.value = searchResults.value.filter(email => email.id !== id);
  } catch (e) { error.value = e instanceof Error ? e.message : 'Delete failed'; }
}

function composeFrom(id: string, action: 'replyTo' | 'forward') {
  router.push({ name: 'compose', query: { [action]: id } });
}

async function runSearch() {
  clearTimeout(searchTimer);
  const q = searchQuery.value.trim();
  if (!q) {
    clearSearch();
    return;
  }
  const version = ++searchVersion;
  isSearching.value = true;
  error.value = '';
  try {
    const result = await api.searchEmails(q);
    if (version === searchVersion) {
      searchResults.value = result.emails;
      activeQuery.value = q;
    }
  } catch (e) {
    if (version === searchVersion) error.value = e instanceof Error ? e.message : 'Search failed';
  } finally {
    if (version === searchVersion) isSearching.value = false;
  }
}

function clearSearch() {
  clearTimeout(searchTimer);
  ++searchVersion;
  isSearching.value = false;
  error.value = '';
  searchQuery.value = '';
  activeQuery.value = '';
  searchResults.value = null;
}
</script>

<template>
  <div class="p-8 max-w-6xl">
    <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
      <h1 class="page-title">Inbox</h1>
      <div class="flex items-center gap-2">
        <form class="relative" @submit.prevent="runSearch">
          <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            v-model="searchQuery"
            type="search"
            aria-label="Search mail"
            placeholder="Search mail…"
            class="input !w-64 !pl-9"
            @keyup.esc="clearSearch"
          />
        </form>
        <button class="btn btn-ghost" @click="emailsStore.fetchEmails('received')">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>
    </div>

    <p v-if="isSearching" role="status" class="text-xs text-ink-3 mb-3">Searching...</p>
    <p v-if="error" role="alert" class="alert-error mb-4">{{ error }}</p>

    <!-- Search results -->
    <template v-if="searchResults !== null">
      <div class="flex items-center justify-between mb-4">
        <p class="text-sm text-ink-2">
          {{ searchResults.length }} result{{ searchResults.length === 1 ? '' : 's' }} for
          "<span class="text-ink font-medium">{{ activeQuery }}</span>"
        </p>
        <button class="text-sm text-accent hover:text-accent-hover font-medium" @click="clearSearch">
          Back to inbox
        </button>
      </div>
      <div v-if="searchResults.length === 0" class="card text-center py-16">
        <h3 class="text-sm font-medium text-ink">No matches</h3>
        <p class="mt-1 text-sm text-ink-3">Search covers subjects, bodies, and addresses.</p>
      </div>
      <div v-else class="card overflow-hidden">
        <EmailList :emails="searchResults" variant="inbox" message-actions @open="openEmail" @toggle-star="toggleStar"
          @toggle-read="toggleRead" @archive="archiveEmail" @delete="deleteEmail"
          @reply="id => composeFrom(id, 'replyTo')" @forward="id => composeFrom(id, 'forward')" />
      </div>
    </template>

    <!-- Normal inbox -->
    <template v-else>
      <!-- Loading state -->
      <div v-if="emailsStore.isLoading" class="flex justify-center py-12">
        <div class="spinner"></div>
      </div>

      <!-- Empty state -->
      <div v-else-if="emails.length === 0" class="card text-center py-16">
        <svg class="mx-auto h-12 w-12 text-ink-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <h3 class="mt-3 text-sm font-medium text-ink">Your inbox is empty</h3>
        <p class="mt-1 text-sm text-ink-3">Mail sent to any address at your domain lands here.</p>
      </div>

      <!-- Email list -->
      <div v-else class="card overflow-hidden pb-1">
        <EmailList
          :emails="emails"
          variant="inbox"
          grouped
          message-actions
          @reply="id => composeFrom(id, 'replyTo')"
          @forward="id => composeFrom(id, 'forward')"
          @open="openEmail"
          @toggle-star="toggleStar"
          @toggle-read="toggleRead"
          @archive="archiveEmail"
          @delete="deleteEmail"
        />
      </div>
    </template>
  </div>
</template>
