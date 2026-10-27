<script setup lang="ts">
import { onMounted, computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useEmailsStore } from '@/stores/emails';
import api from '@/api/client';
import type { Email } from '@/api/types';
import EmailList from '@/components/EmailList.vue';

const router = useRouter();
const emailsStore = useEmailsStore();

const searchQuery = ref('');
const searchResults = ref<Email[] | null>(null);
const isSearching = ref(false);

onMounted(async () => {
  await emailsStore.fetchEmails('received');
});

const emails = computed(() => emailsStore.inbox);

function openEmail(id: string) {
  const fromSearch = searchResults.value?.find(e => e.id === id);
  router.push({ name: fromSearch?.type === 'sent' ? 'sent-email' : 'email', params: { id } });
}

async function toggleStar(id: string) {
  await emailsStore.toggleStar(id);
}

async function toggleRead(id: string) {
  const email = emailsStore.emails.find(e => e.id === id);
  if (email?.is_read) {
    await emailsStore.markAsUnread(id);
  } else {
    await emailsStore.markAsRead(id);
  }
}

async function archiveEmail(id: string) {
  await api.archiveEmail(id);
  emailsStore.emails = emailsStore.emails.filter(e => e.id !== id);
  await emailsStore.fetchStats();
}

async function deleteEmail(id: string) {
  await emailsStore.deleteEmail(id);
}

async function runSearch() {
  const q = searchQuery.value.trim();
  if (!q) {
    searchResults.value = null;
    return;
  }
  isSearching.value = true;
  try {
    searchResults.value = (await api.searchEmails(q)).emails;
  } finally {
    isSearching.value = false;
  }
}

function clearSearch() {
  searchQuery.value = '';
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

    <!-- Search results -->
    <template v-if="searchResults !== null">
      <div class="flex items-center justify-between mb-4">
        <p class="text-sm text-ink-2">
          {{ searchResults.length }} result{{ searchResults.length === 1 ? '' : 's' }} for
          "<span class="text-ink font-medium">{{ searchQuery }}</span>"
        </p>
        <button class="text-sm text-accent hover:text-accent-hover font-medium" @click="clearSearch">
          Back to inbox
        </button>
      </div>
      <div v-if="isSearching" class="flex justify-center py-12"><div class="spinner"></div></div>
      <div v-else-if="searchResults.length === 0" class="card text-center py-16">
        <h3 class="text-sm font-medium text-ink">No matches</h3>
        <p class="mt-1 text-sm text-ink-3">Search covers subjects, bodies, and addresses.</p>
      </div>
      <div v-else class="card overflow-hidden">
        <EmailList :emails="searchResults" variant="inbox" @open="openEmail" @toggle-star="toggleStar" />
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
