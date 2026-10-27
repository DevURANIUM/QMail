<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useEmailsStore } from '@/stores/emails';
import EmailList from '@/components/EmailList.vue';

const router = useRouter();
const emailsStore = useEmailsStore();

onMounted(async () => {
  await emailsStore.fetchEmails('sent');
});

const emails = computed(() => emailsStore.sent);

function openEmail(id: string) {
  router.push({ name: 'sent-email', params: { id } });
}
</script>

<template>
  <div class="p-8 max-w-6xl">
    <div class="flex items-center justify-between mb-6">
      <h1 class="page-title">Sent</h1>
      <button class="btn btn-ghost" @click="emailsStore.fetchEmails('sent')">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Refresh
      </button>
    </div>

    <!-- Loading state -->
    <div v-if="emailsStore.isLoading" class="flex justify-center py-12">
      <div class="spinner"></div>
    </div>

    <!-- Empty state -->
    <div v-else-if="emails.length === 0" class="card text-center py-16">
      <svg class="mx-auto h-12 w-12 text-ink-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
      </svg>
      <h3 class="mt-3 text-sm font-medium text-ink">Nothing sent yet</h3>
      <p class="mt-1 text-sm text-ink-3">Messages you send will appear here.</p>
      <router-link :to="{ name: 'compose' }" class="btn btn-primary mt-4">
        Compose email
      </router-link>
    </div>

    <!-- Email list -->
    <div v-else class="card overflow-hidden">
      <EmailList :emails="emails" variant="sent" @open="openEmail" />
    </div>
  </div>
</template>
