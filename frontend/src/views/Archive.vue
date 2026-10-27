<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import api from '@/api/client';
import type { Email } from '@/api/types';
import EmailList from '@/components/EmailList.vue';

const router = useRouter();
const emails = ref<Email[]>([]);
const isLoading = ref(true);

async function load() {
  isLoading.value = true;
  try {
    const response = await api.getEmails({ type: 'received', archived: true, limit: 100 });
    emails.value = response.emails;
  } finally {
    isLoading.value = false;
  }
}

onMounted(load);

function openEmail(id: string) {
  router.push({ name: 'email', params: { id } });
}

async function unarchive(id: string) {
  await api.unarchiveEmail(id);
  await load();
}

async function deleteEmail(id: string) {
  await api.deleteEmail(id);
  await load();
}
</script>

<template>
  <div class="p-8 max-w-6xl">
    <h1 class="page-title mb-6">Archive</h1>

    <div v-if="isLoading" class="flex justify-center py-12">
      <div class="spinner"></div>
    </div>

    <div v-else-if="emails.length === 0" class="card text-center py-16">
      <h3 class="text-sm font-medium text-ink">Nothing archived</h3>
      <p class="mt-1 text-sm text-ink-3">Archived mail stays searchable without cluttering the inbox.</p>
    </div>

    <div v-else class="card overflow-hidden">
      <EmailList
        :emails="emails"
        variant="inbox"
        archive-action="unarchive"
        @open="openEmail"
        @archive="unarchive"
        @delete="deleteEmail"
      />
    </div>
  </div>
</template>
