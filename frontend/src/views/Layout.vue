<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useEmailsStore } from '@/stores/emails';
import { useThemeStore } from '@/stores/theme';
import api from '@/api/client';
import InstallApp from '@/components/InstallApp.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const emailsStore = useEmailsStore();
const themeStore = useThemeStore();

const navigation = [
  { name: 'Dashboard', route: 'dashboard', icon: 'home' },
  { name: 'Inbox', route: 'inbox', icon: 'inbox' },
  { name: 'Sent', route: 'sent', icon: 'send' },
  { name: 'Drafts', route: 'drafts', icon: 'draft' },
  { name: 'Archive', route: 'archive', icon: 'archive' },
  { name: 'Folders', route: 'folders', icon: 'archive' },
  { name: 'Contacts', route: 'contacts', icon: 'people' },
  { name: 'Settings', route: 'settings', icon: 'settings' },
];

const currentRoute = computed(() => route.name);
const mobileOpen = ref(false);
watch(() => route.fullPath, () => { mobileOpen.value = false; });
const pageName = computed(() => navigation.find(item => item.route === route.name)?.name || 'Your workspace');
const labels = ref<string[]>([]);

onMounted(async () => {
  try {
    labels.value = (await api.getLabels()).labels;
  } catch {
    // Labels are decorative in the sidebar; ignore load errors
  }
});

const themeLabel = computed(() => {
  const labels = { light: 'Light', dark: 'Dark', system: 'System' } as const;
  return labels[themeStore.preference];
});

async function logout() {
  await authStore.logout();
  router.push({ name: 'login' });
}
</script>

<template>
  <div class="app-shell min-h-screen bg-page">
    <a href="#main-content" class="skip-link">Skip to content</a>
    <button v-if="mobileOpen" class="sidebar-backdrop" aria-label="Close navigation" @click="mobileOpen = false"></button>
    <!-- Sidebar -->
    <aside id="workspace-navigation" class="app-sidebar fixed inset-y-0 left-0 w-64 bg-surface border-r border-edge flex flex-col" :class="{ 'is-open': mobileOpen }" @keydown.esc="mobileOpen = false">
      <!-- Wordmark -->
      <div class="flex items-center h-16 px-6 border-b border-edge">
        <div class="h-8 w-8 bg-accent rounded-lg flex items-center justify-center">
          <img src="/favicon.svg" alt="" class="h-full w-full" />
        </div>
        <span class="ml-2.5 text-xl font-display text-ink">Qmail</span>
      </div>

      <div class="px-5 pt-6 pb-2">
        <router-link :to="{ name: 'compose' }" class="btn btn-primary w-full sidebar-compose"><span aria-hidden="true" class="text-xl leading-none">+</span> New message</router-link>
      </div>
      <!-- Navigation -->
      <nav aria-label="Main navigation" class="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
        <router-link
          v-for="item in navigation"
          :key="item.route"
          :to="{ name: item.route }"
          class="flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors"
          :class="currentRoute === item.route || (item.route === 'inbox' && currentRoute === 'email') || (item.route === 'sent' && currentRoute === 'sent-email')
            ? 'bg-accent-soft text-accent'
            : 'text-ink-2 hover:bg-surface-2 hover:text-ink'"
        >
          <!-- Icons -->
          <svg v-if="item.icon === 'home'" class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <svg v-if="item.icon === 'inbox'" class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <svg v-if="item.icon === 'send'" class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
          <svg v-if="item.icon === 'draft'" class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <svg v-if="item.icon === 'archive'" class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
          <svg v-if="item.icon === 'people'" class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <svg v-if="item.icon === 'settings'" class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>

          <span>{{ item.name }}</span>

          <!-- Unread badge for inbox -->
          <span
            v-if="item.route === 'inbox' && emailsStore.stats.unread > 0"
            class="ml-auto bg-accent text-accent-ink text-xs font-medium px-2 py-0.5 rounded-full tabular-nums"
          >
            {{ emailsStore.stats.unread }}
          </span>
        </router-link>

        <!-- Labels -->
        <div v-if="labels.length > 0" class="pt-4">
          <p class="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-ink-3">Labels</p>
          <router-link
            v-for="label in labels"
            :key="label"
            :to="{ name: 'label', params: { label } }"
            class="flex items-center px-3 py-1.5 text-sm rounded-lg transition-colors"
            :class="currentRoute === 'label' && route.params.label === label
              ? 'bg-accent-soft text-accent'
              : 'text-ink-2 hover:bg-surface-2 hover:text-ink'"
          >
            <span class="w-2 h-2 rounded-full bg-accent mr-3 flex-shrink-0"></span>
            <span class="truncate">{{ label }}</span>
          </router-link>
        </div>
      </nav>

      <!-- Bottom section -->
      <div class="border-t border-edge">
        <div class="p-4 space-y-1">
          <InstallApp class="mb-3" />
          <!-- Theme toggle: cycles light → dark → system -->
          <button
            class="flex items-center w-full px-3 py-2 text-sm font-medium text-ink-2 rounded-lg hover:bg-surface-2 hover:text-ink transition-colors"
            :title="`Theme: ${themeLabel} (click to change)`"
            @click="themeStore.cycle()"
          >
            <!-- sun / moon / auto icon -->
            <svg v-if="themeStore.preference === 'light'" class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <svg v-else-if="themeStore.preference === 'dark'" class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
            <svg v-else class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span>Theme</span>
            <span class="ml-auto text-xs text-ink-3">{{ themeLabel }}</span>
          </button>

          <button
            class="flex items-center w-full px-3 py-2 text-sm font-medium text-ink-2 rounded-lg hover:bg-surface-2 hover:text-ink transition-colors"
            @click="logout"
          >
            <svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </div>
        <!-- Open Source Footer -->
        <div class="px-4 py-3 bg-surface-2 border-t border-edge">
          <a
            href="https://github.com/DevURANIUM/QMail"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center justify-center text-xs text-ink-3 hover:text-ink-2 transition-colors"
          >
            <svg class="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 24 24">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
            </svg>
            Open source on GitHub
          </a>
        </div>
      </div>
    </aside>

    <!-- Main content -->
    <div class="workspace ml-64 min-h-screen">
      <header class="workspace-topbar">
        <div class="flex items-center gap-3">
          <button class="btn-icon mobile-menu" aria-label="Toggle navigation" aria-controls="workspace-navigation" :aria-expanded="mobileOpen" @click="mobileOpen = !mobileOpen"><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg></button>
          <span class="text-sm text-ink-3">Workspace <span class="mx-2" aria-hidden="true">/</span> <span class="text-ink font-medium">{{ pageName }}</span></span>
        </div>
        <div class="flex items-center gap-3"><span class="workspace-privacy"><span aria-hidden="true"></span> Your mail, your space</span><span class="workspace-avatar" aria-label="Personal workspace">Q</span></div>
      </header>
      <main id="main-content" tabindex="-1">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in"><component :is="Component" :key="route.path" /></transition>
        </router-view>
      </main>
    </div>

    <!-- Floating compose button -->
    <router-link
      v-if="currentRoute !== 'compose'"
      :to="{ name: 'compose' }"
      aria-label="Compose email"
      title="Compose"
      class="fixed bottom-8 right-8 z-40 w-14 h-14 rounded-full bg-accent text-accent-ink shadow-pop
        flex items-center justify-center hover:bg-accent-hover hover:scale-105 active:scale-95 transition-all
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    </router-link>
  </div>
</template>
