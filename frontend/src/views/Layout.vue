<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useEmailsStore } from '@/stores/emails';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const emailsStore = useEmailsStore();
const isDark = ref(document.documentElement.classList.contains('dark'));
const mobileMenu = ref(false);
const currentRoute = computed(() => route.name);

const navigation = [
  { name: 'Overview', route: 'dashboard', icon: 'grid' },
  { name: 'Inbox', route: 'inbox', icon: 'inbox' },
  { name: 'Sent', route: 'sent', icon: 'send' },
  { name: 'Settings', route: 'settings', icon: 'settings' },
];

onMounted(() => emailsStore.fetchStats());

function toggleTheme() {
  isDark.value = !isDark.value;
  document.documentElement.classList.toggle('dark', isDark.value);
  localStorage.setItem('qmail_theme', isDark.value ? 'dark' : 'light');
}
async function logout() { await authStore.logout(); router.push({ name: 'login' }); }
function isActive(name: string) {
  return currentRoute.value === name || (name === 'inbox' && currentRoute.value === 'email') || (name === 'sent' && currentRoute.value === 'sent-email');
}
</script>

<template>
  <div class="min-h-screen app-shell">
    <div v-if="mobileMenu" class="fixed inset-0 z-30 bg-black/60 lg:hidden" @click="mobileMenu = false"></div>
    <aside class="fixed inset-y-0 left-0 z-40 flex flex-col w-64 sidebar transition-transform lg:translate-x-0" :class="mobileMenu ? 'translate-x-0' : '-translate-x-full'">
      <div class="flex items-center h-20 px-5">
        <div class="q-logo">Q</div>
        <div class="ml-3"><p class="text-lg font-extrabold tracking-tight text-white">QMail</p><p class="text-[10px] uppercase tracking-[.2em] text-slate-400">Private mail</p></div>
        <button @click="mobileMenu = false" class="ml-auto p-2 text-slate-400 lg:hidden" aria-label="Close navigation">✕</button>
      </div>
      <div class="px-4 mb-5">
        <router-link :to="{ name: 'compose' }" class="compose-button" @click="mobileMenu = false">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
          New message
        </router-link>
      </div>
      <nav class="flex-1 px-3 space-y-1">
        <router-link v-for="item in navigation" :key="item.route" :to="{ name: item.route }" class="nav-item" :class="{ active: isActive(item.route) }" @click="mobileMenu = false">
          <svg v-if="item.icon === 'grid'" class="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z" /></svg>
          <svg v-else-if="item.icon === 'inbox'" class="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4h16v14H4V4zm0 9h4l2 3h4l2-3h4" /></svg>
          <svg v-else-if="item.icon === 'send'" class="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m22 2-7 20-4-9-9-4 20-7z" /></svg>
          <svg v-else class="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.6v.2h-4V21a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 00.3-1.9A1.7 1.7 0 003 14H2.8v-4H3a1.7 1.7 0 001.6-1 1.7 1.7 0 00-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 001.9.3A1.7 1.7 0 0010 3v-.2h4V3a1.7 1.7 0 001 1.6 1.7 1.7 0 001.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 00-.3 1.9 1.7 1.7 0 001.6 1h.2v4H21a1.7 1.7 0 00-1.6 1z" /></svg>
          <span>{{ item.name }}</span>
          <span v-if="item.route === 'inbox' && emailsStore.stats.unread" class="nav-badge">{{ emailsStore.stats.unread }}</span>
        </router-link>
      </nav>
      <div class="p-3 border-t border-white/10">
        <button @click="toggleTheme" class="nav-item w-full"><span class="text-lg">{{ isDark ? '☀' : '☾' }}</span><span>{{ isDark ? 'Light mode' : 'Dark mode' }}</span></button>
        <button @click="logout" class="nav-item w-full hover:!text-red-300"><svg class="nav-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 17l5-5-5-5m5 5H3m11-9h5a2 2 0 012 2v14a2 2 0 01-2 2h-5" /></svg><span>Sign out</span></button>
      </div>
    </aside>
    <div class="lg:ml-64">
      <div class="sticky top-0 z-20 flex items-center h-14 px-4 mobile-bar lg:hidden"><button @click="mobileMenu = true" class="p-2 text-gray-600" aria-label="Open navigation">☰</button><span class="ml-3 font-bold text-gray-900">QMail</span></div>
      <main><router-view /></main>
    </div>
  </div>
</template>

<style scoped>
.app-shell { background:#f4f7fb; }
.sidebar { background:linear-gradient(180deg,#090f1d 0%,#0e182b 52%,#0a1220 100%); border-right:1px solid rgba(129,140,248,.14); box-shadow:12px 0 45px rgba(0,0,0,.14); }
.q-logo { @apply flex items-center justify-center w-10 h-10 text-lg font-black text-white rounded-xl; background:linear-gradient(135deg,#6366f1,#2563eb); box-shadow:0 8px 22px rgba(37,99,235,.3); }
.compose-button { @apply flex items-center justify-center w-full gap-2 px-4 py-3 text-sm font-bold text-white rounded-xl; background:linear-gradient(135deg,#4f46e5,#2563eb); box-shadow:0 9px 24px rgba(37,99,235,.22); }
.compose-button:hover { filter:brightness(1.1); transform:translateY(-1px); }
.nav-item { @apply flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-slate-400 rounded-xl hover:text-white; }
.nav-item:hover { background:rgba(255,255,255,.06); }
.nav-item.active { color:#fff; background:linear-gradient(90deg,rgba(79,70,229,.28),rgba(37,99,235,.14)); box-shadow:inset 3px 0 0 #818cf8; }
.nav-icon { @apply w-5 h-5; }
.nav-badge { @apply px-2 py-0.5 ml-auto text-[11px] font-bold text-indigo-100 bg-indigo-500/30 rounded-full; }
.mobile-bar { background:rgba(255,255,255,.9); backdrop-filter:blur(14px); border-bottom:1px solid #e2e8f0; }
</style>
