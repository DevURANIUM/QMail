<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

import { deferredPrompt } from '@/pwa';
const installing = ref(false);
const installed = ref(false);
const message = ref('');
const displayMode = window.matchMedia('(display-mode: standalone)');
function syncInstalled() {
  installed.value = displayMode.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
function didInstall() {
  installed.value = true;
  deferredPrompt.value = null;
}
async function install() {
  message.value = '';
  if (!deferredPrompt.value) { message.value = 'Installation is not available right now.'; return; }
  installing.value = true;
  const prompt = deferredPrompt.value;
  deferredPrompt.value = null;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => { await prompt.prompt(); return prompt.userChoice; })(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Install prompt timed out')), 12000);
      }),
    ]);
  } catch {
    message.value = 'Installation could not start. Please try again.';
  } finally {
    clearTimeout(timeout);
    installing.value = false;
  }
}
onMounted(() => {
  syncInstalled();
  window.addEventListener('appinstalled', didInstall);
  displayMode.addEventListener('change', syncInstalled);
});
onUnmounted(() => {
  window.removeEventListener('appinstalled', didInstall);
  displayMode.removeEventListener('change', syncInstalled);
});
</script>

<template>
  <div v-if="!installed">
    <button type="button" class="btn btn-ghost w-full" :disabled="installing" @click="install">
      <svg aria-hidden="true" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4" /></svg>
      {{ installing ? 'Opening...' : 'Install Qmail' }}
    </button>
    <p v-if="message" role="status" class="hint">{{ message }}</p>
  </div>
</template>
