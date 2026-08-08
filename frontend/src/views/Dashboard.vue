<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useEmailsStore } from '@/stores/emails';
import api from '@/api/client';
import type { SetupStatus } from '@/api/types';
const router = useRouter();
const emailsStore = useEmailsStore();
const setup = ref<SetupStatus | null>(null);
const loading = ref(true);
onMounted(async () => { try { const [, status] = await Promise.all([emailsStore.fetchStats(), api.getSetupStatus()]); setup.value = status; } finally { loading.value = false; } });
const total = computed(() => emailsStore.stats.total_received + emailsStore.stats.total_sent);
const cards = computed(() => [
  { label:'Total mail', value:total.value, hint:'All conversations', tone:'indigo', route:'inbox' },
  { label:'Inbox', value:emailsStore.stats.total_received, hint:'Received messages', tone:'blue', route:'inbox' },
  { label:'Unread', value:emailsStore.stats.unread, hint:'Needs your attention', tone:'amber', route:'inbox' },
  { label:'Sent', value:emailsStore.stats.total_sent, hint:'Outgoing messages', tone:'emerald', route:'sent' },
]);
</script>
<template>
  <div class="qm-page"><div class="qm-container">
    <div class="flex flex-wrap items-end justify-between gap-4 mb-8"><div><p class="text-xs font-bold tracking-[.2em] uppercase text-primary-600">Workspace</p><h1 class="qm-title mt-1">Good to see you</h1><p class="qm-subtitle">Here’s what’s happening in your QMail inbox.</p></div><router-link :to="{name:'compose'}" class="qm-button-primary">Compose message</router-link></div>
    <div v-if="loading" class="flex justify-center py-24"><div class="spinner"></div></div>
    <template v-else>
      <div v-if="!setup?.setupCompleted" class="setup-banner mb-6"><div><p class="font-bold text-amber-900">Finish your QMail setup</p><p class="mt-1 text-sm text-amber-800">Connect Cloudflare and Brevo to unlock sending and receiving.</p></div><router-link :to="{name:'settings'}" class="px-4 py-2 text-sm font-bold text-amber-950 bg-amber-200 rounded-xl">Open settings</router-link></div>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <button v-for="card in cards" :key="card.label" @click="router.push({name:card.route})" class="stat-card qm-card text-left"><div class="stat-icon" :class="card.tone">{{ card.label.charAt(0) }}</div><p class="mt-5 text-sm font-semibold text-gray-500">{{ card.label }}</p><p class="mt-1 text-3xl font-black tracking-tight text-gray-900">{{ card.value }}</p><p class="mt-1 text-xs text-gray-400">{{ card.hint }}</p></button>
      </div>
      <div class="grid gap-5 mt-5 lg:grid-cols-[1.4fr_1fr]">
        <section class="qm-card p-6"><div class="flex items-center justify-between"><div><h2 class="font-bold text-gray-900">Inbox health</h2><p class="text-sm text-gray-500">Your current message overview</p></div><span class="status-pill">Live</span></div><div class="mt-8"><div class="flex justify-between mb-2 text-sm"><span class="text-gray-500">Read progress</span><span class="font-bold text-gray-900">{{ emailsStore.stats.total_received ? Math.round((emailsStore.stats.total_received-emailsStore.stats.unread)/emailsStore.stats.total_received*100) : 100 }}%</span></div><div class="h-2 overflow-hidden bg-gray-100 rounded-full"><div class="h-full rounded-full bg-gradient-to-r from-indigo-500 to-blue-500" :style="{width:`${emailsStore.stats.total_received ? Math.round((emailsStore.stats.total_received-emailsStore.stats.unread)/emailsStore.stats.total_received*100) : 100}%`}"></div></div></div></section>
        <section class="qm-card p-6"><h2 class="font-bold text-gray-900">Services</h2><div class="mt-5 space-y-4"><div class="service-row"><span>Cloudflare routing</span><span :class="setup?.cloudflare.configured ? 'ok' : 'off'">{{ setup?.cloudflare.configured ? 'Connected' : 'Not connected' }}</span></div><div class="service-row"><span>Brevo sending</span><span :class="setup?.brevo.configured ? 'ok' : 'off'">{{ setup?.brevo.configured ? 'Connected' : 'Not connected' }}</span></div></div></section>
      </div>
    </template>
  </div></div>
</template>
<style scoped>
.setup-banner { @apply flex flex-wrap items-center justify-between gap-4 p-5 border border-amber-200 rounded-2xl; background:linear-gradient(135deg,#fffbeb,#fef3c7); }
.stat-card { @apply p-5 transition-all hover:-translate-y-1 hover:shadow-lg; position:relative; overflow:hidden; }
.stat-card::after { content:""; position:absolute; width:105px; height:105px; right:-48px; top:-48px; border-radius:999px; background:rgba(99,102,241,.09); }
.stat-icon { @apply flex items-center justify-center w-10 h-10 font-black rounded-xl; }
.stat-icon.indigo{background:#e0e7ff;color:#4338ca}.stat-icon.blue{background:#dbeafe;color:#1d4ed8}.stat-icon.amber{background:#fef3c7;color:#b45309}.stat-icon.emerald{background:#d1fae5;color:#047857}
.status-pill,.ok { @apply px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-100 rounded-full; }.off{@apply px-2.5 py-1 text-xs font-bold text-gray-500 bg-gray-100 rounded-full}.service-row{@apply flex items-center justify-between text-sm text-gray-700}
</style>
