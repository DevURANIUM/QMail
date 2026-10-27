<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '@/api/client';
import type { Email } from '@/api/types';
import EmailList from '@/components/EmailList.vue';

const route = useRoute();
const router = useRouter();
const emails = ref<Email[]>([]);
const isLoading = ref(true);

async function load() {
  isLoading.value = true;
  try {
    const response = await api.getEmails({ label: route.params.label as string, limit: 100 });
    emails.value = response.emails;
  } finally {
    isLoading.value = false;
  }
}

onMounted(load);
watch(() => route.params.label, load);

function openEmail(id: string) {
  const email = emails.value.find(e => e.id === id);
  router.push({ name: email?.type === 'sent' ? 'sent-email' : 'email', params: { id } });
}
</script>

<template>
  <div class="p-8 max-w-6xl">
    <h1 class="page-title mb-6">
      Label: <span class="text-accent">{{ route.params.label }}</span>
    </h1>

    <div v-if="isLoading" class="flex justify-center py-12">
      <div class="spinner"></div>
    </div>

    <div v-else-if="emails.length === 0" class="card text-center py-16">
      <h3 class="text-sm font-medium text-ink">No mail with this label</h3>
    </div>

    <div v-else class="card overflow-hidden">
      <EmailList :emails="emails" variant="inbox" @open="openEmail" />
    </div>
  </div>
</template>
