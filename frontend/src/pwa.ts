import { ref } from 'vue';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Register before routing: the browser can fire this while the login page is open.
export const deferredPrompt = ref<InstallPrompt | null>(null);
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt.value = event as InstallPrompt;
});
window.addEventListener('appinstalled', () => { deferredPrompt.value = null; });
