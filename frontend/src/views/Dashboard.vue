<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useEmailsStore } from '@/stores/emails';
import api from '@/api/client';
import type { SetupStatus, ActivityPoint, Email } from '@/api/types';
import ActivityChart from '@/components/ActivityChart.vue';
import EmailList from '@/components/EmailList.vue';

const router = useRouter();
const emailsStore = useEmailsStore();
const setupStatus = ref<SetupStatus | null>(null);
const activity = ref<ActivityPoint[]>([]);
const recentEmails = ref<Email[]>([]);
const isLoading = ref(true);

onMounted(async () => {
  try {
    const [, status, activityRes, recentRes] = await Promise.all([
      emailsStore.fetchStats(),
      api.getSetupStatus(),
      api.getEmailActivity(14),
      api.getEmails({ type: 'received', limit: 5 }),
    ]);
    setupStatus.value = status;
    activity.value = activityRes.activity;
    recentEmails.value = recentRes.emails;
  } catch (error) {
    console.error('Failed to load dashboard:', error);
  } finally {
    isLoading.value = false;
  }
});

const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
});

const receivedThisWeek = computed(() =>
  activity.value.slice(-7).reduce((sum, p) => sum + p.received, 0)
);

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const tiles = computed(() => [
  { name: 'Inbox', value: String(emailsStore.stats.total_received), route: 'inbox' },
  { name: 'Unread', value: String(emailsStore.stats.unread), route: 'inbox' },
  { name: 'Sent', value: String(emailsStore.stats.total_sent), route: 'sent' },
  { name: 'Storage used', value: formatBytes(emailsStore.stats.storage_bytes), route: null },
]);

function openEmail(id: string) {
  router.push({ name: 'email', params: { id } });
}
</script>

<template>
  <div class="dashboard p-8 max-w-6xl">
    <!-- Header -->
    <div class="dashboard-welcome flex flex-wrap items-end justify-between gap-4 mb-8">
      <div>
        <p class="welcome-note">A little less noise. A lot more focus.</p>
        <h1 class="page-title">{{ greeting }}.</h1>
        <p class="mt-1.5 text-sm text-ink-2 flex items-center gap-2">
          <template v-if="setupStatus?.domain">
            Mail is flowing through
            <span class="font-mono text-xs bg-accent-soft text-accent rounded-md px-2 py-0.5">{{ setupStatus.domain }}</span>
            <span v-if="receivedThisWeek > 0">· {{ receivedThisWeek }} received this week</span>
          </template>
          <template v-else>Your mail, on your own domain.</template>
        </p>
      </div>
      <router-link :to="{ name: 'compose' }" class="btn btn-primary">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        Compose
      </router-link>
    </div>

    <!-- Loading state -->
    <div v-if="isLoading" class="flex justify-center py-12">
      <div class="spinner"></div>
    </div>

    <template v-else>
      <!-- Setup warning -->
      <div v-if="setupStatus && !setupStatus.setupCompleted" class="mb-8 rounded-xl bg-warning-soft border border-edge p-4">
        <div class="flex">
          <svg class="h-5 w-5 text-warning flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>
          <div class="ml-3">
            <h3 class="text-sm font-medium text-warning">Setup required</h3>
            <p class="mt-1 text-sm text-ink-2">
              Connect Cloudflare and Brevo to start receiving and sending mail.
            </p>
            <router-link
              :to="{ name: 'settings' }"
              class="mt-2 inline-flex items-center text-sm font-medium text-accent hover:text-accent-hover"
            >
              Open settings
              <svg class="ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </router-link>
          </div>
        </div>
      </div>

      <!-- Stat tiles -->
      <div class="stats-grid grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <component
          :is="tile.route ? 'button' : 'div'"
          v-for="tile in tiles"
          :key="tile.name"
          class="card p-5 text-left"
          :class="tile.route ? 'hover:border-edge-2 transition-colors cursor-pointer' : ''"
          @click="tile.route && router.push({ name: tile.route })"
        >
          <p class="text-sm text-ink-2">{{ tile.name }}</p>
          <p class="mt-1 text-3xl font-display text-ink">{{ tile.value }}</p>
        </component>
      </div>

      <router-link :to="{ name: 'settings', query: { tab: 'telegram' } }" class="telegram-shortcut mb-6">
        <span class="telegram-shortcut-icon" aria-hidden="true">↗</span>
        <span class="flex-1"><strong class="block text-sm">Take your inbox with you.</strong><span class="text-sm text-ink-2">Connect your Telegram bot and receive new emails wherever you are.</span></span>
        <span class="text-sm font-semibold text-accent">Connect Telegram</span>
      </router-link>

      <!-- Activity chart -->
      <div class="card p-6 mb-6">
        <div class="flex items-baseline justify-between mb-1">
          <h2 class="text-base font-semibold text-ink">Activity</h2>
          <span class="text-xs text-ink-3">Last 14 days</span>
        </div>
        <ActivityChart :activity="activity" />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <!-- Recent messages -->
        <div class="card lg:col-span-3 overflow-hidden">
          <div class="flex items-center justify-between px-6 pt-5 pb-3">
            <h2 class="text-base font-semibold text-ink">Recent messages</h2>
            <router-link :to="{ name: 'inbox' }" class="text-sm text-accent hover:text-accent-hover font-medium">
              View inbox
            </router-link>
          </div>
          <EmailList
            v-if="recentEmails.length > 0"
            :emails="recentEmails"
            variant="inbox"
            compact
            @open="openEmail"
          />
          <p v-else class="px-6 pb-6 text-sm text-ink-3">
            Nothing yet. Mail sent to your domain will appear here.
          </p>
        </div>

        <!-- System status -->
        <div class="card lg:col-span-2 p-6">
          <h2 class="text-base font-semibold text-ink mb-4">System</h2>
          <dl class="space-y-3.5">
            <div class="flex items-center justify-between">
              <dt class="text-sm text-ink-2">Receiving <span class="text-ink-3">· Cloudflare</span></dt>
              <dd class="flex items-center gap-1.5 text-sm" :class="setupStatus?.cloudflare.configured ? 'text-success' : 'text-ink-3'">
                <svg v-if="setupStatus?.cloudflare.configured" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
                <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                {{ setupStatus?.cloudflare.configured ? 'Connected' : 'Not set up' }}
              </dd>
            </div>
            <div class="flex items-center justify-between">
              <dt class="text-sm text-ink-2">Sending <span class="text-ink-3">· Brevo</span></dt>
              <dd class="flex items-center gap-1.5 text-sm" :class="setupStatus?.brevo.configured ? 'text-success' : 'text-ink-3'">
                <svg v-if="setupStatus?.brevo.configured" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
                <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                {{ setupStatus?.brevo.configured ? 'Connected' : 'Not set up' }}
              </dd>
            </div>
            <div v-if="setupStatus?.domain" class="flex items-center justify-between pt-3 border-t border-edge">
              <dt class="text-sm text-ink-2">Domain</dt>
              <dd class="text-sm font-mono text-ink">{{ setupStatus.domain }}</dd>
            </div>
            <div v-if="setupStatus?.destinationEmail" class="flex items-center justify-between">
              <dt class="text-sm text-ink-2">Forwarding to</dt>
              <dd class="text-sm font-mono text-ink truncate max-w-[10rem]" :title="setupStatus.destinationEmail">
                {{ setupStatus.destinationEmail }}
              </dd>
            </div>
            <div class="flex items-center justify-between">
              <dt class="text-sm text-ink-2">Starred</dt>
              <dd class="text-sm text-ink tabular-nums">{{ emailsStore.stats.starred }}</dd>
            </div>
          </dl>
        </div>
      </div>
    </template>
  </div>
</template>
