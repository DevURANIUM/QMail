<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '@/api/client';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import type { Settings, SetupStatus, Address, DNSRecord, Passkey } from '@/api/types';

const authStore = useAuthStore();

const activeTab = ref<'cloudflare' | 'brevo' | 'addresses' | 'security' | 'telegram'>('cloudflare');
if (useRoute().query.tab === 'telegram') activeTab.value = 'telegram';
const isLoading = ref(true);
const isSaving = ref(false);
const error = ref('');
const success = ref('');

// Settings data
const settings = ref<Settings | null>(null);
const setupStatus = ref<SetupStatus | null>(null);
const addresses = ref<Address[]>([]);
const passkeys = ref<Passkey[]>([]);

// Cloudflare form
const cfApiKey = ref('');
const cfAccountId = ref('');
const cfDomain = ref('');
const cfDestinationEmail = ref('');
const cfDnsRecords = ref<DNSRecord[]>([]);

// Brevo form
const brevoApiKey = ref('');
const brevoAccountEmail = ref('');

const telegramToken = ref('');
const telegramChatId = ref('');
const telegramEnabled = ref(false);
const isTestingTelegram = ref(false);

async function saveTelegram() {
  clearAlerts();
  isSaving.value = true;
  try {
    await api.saveTelegram({ botToken: telegramToken.value || undefined, chatId: telegramChatId.value, enabled: telegramEnabled.value });
    telegramToken.value = '';
    await loadData();
    success.value = 'Telegram settings saved.';
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not save Telegram settings.';
  } finally { isSaving.value = false; }
}

async function testTelegram() {
  clearAlerts();
  isTestingTelegram.value = true;
  try {
    await api.testTelegram();
    success.value = 'Test message delivered to Telegram.';
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Telegram test failed.';
  } finally { isTestingTelegram.value = false; }
}

// Address form
const newAddress = ref('');
const newDisplayName = ref('');

// Password form
const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');

// Passkey form
const passkeyName = ref('');
const isAddingPasskey = ref(false);

// Push notifications
const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window;
const pushEnabled = ref(false);
const isTogglingPush = ref(false);

// Privacy
const blockRemoteImages = ref(true);

// Export
const isExporting = ref(false);

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const raw = atob(padded);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

async function refreshPushState() {
  if (!pushSupported) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    pushEnabled.value = !!(await registration.pushManager.getSubscription());
  } catch {
    pushEnabled.value = false;
  }
}

async function togglePush() {
  clearAlerts();
  isTogglingPush.value = true;
  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();

    if (existing) {
      await api.pushUnsubscribe(existing.endpoint);
      await existing.unsubscribe();
      pushEnabled.value = false;
      success.value = 'Push notifications disabled.';
    } else {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        error.value = 'Notification permission was denied by the browser.';
        return;
      }
      const { key } = await api.getVapidKey();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key).buffer as ArrayBuffer,
      });
      await api.pushSubscribe(subscription.toJSON());
      pushEnabled.value = true;
      success.value = 'Push notifications enabled — you\'ll be notified of new mail.';
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to update notifications';
  } finally {
    isTogglingPush.value = false;
  }
}

async function toggleBlockImages() {
  clearAlerts();
  try {
    blockRemoteImages.value = !blockRemoteImages.value;
    await api.updateSettings({ block_remote_images: String(blockRemoteImages.value) });
    success.value = blockRemoteImages.value
      ? 'Remote images are now blocked by default.'
      : 'Remote images will load automatically.';
  } catch (e) {
    blockRemoteImages.value = !blockRemoteImages.value;
    error.value = e instanceof Error ? e.message : 'Failed to update setting';
  }
}

async function exportMbox() {
  clearAlerts();
  isExporting.value = true;
  try {
    await api.downloadMbox();
    success.value = 'Mailbox export downloaded.';
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Export failed';
  } finally {
    isExporting.value = false;
  }
}

onMounted(async () => {
  await loadData();
  await refreshPushState();
  blockRemoteImages.value = settings.value?.block_remote_images !== 'false';
});

async function loadData() {
  isLoading.value = true;
  try {
    const [sett, status, addrs, keys] = await Promise.all([
      api.getSettings(),
      api.getSetupStatus(),
      api.getAddresses(),
      api.getPasskeys().catch(() => ({ credentials: [] })),
    ]);

    settings.value = sett;
    setupStatus.value = status;
    addresses.value = addrs;
    passkeys.value = keys.credentials;

    // Populate form fields
    telegramChatId.value = sett.telegram_chat_id || '';
    telegramEnabled.value = sett.telegram_enabled === 'true';
    cfDomain.value = sett.domain || '';
    cfDestinationEmail.value = sett.destination_email || '';
  } catch (e) {
    error.value = 'Failed to load settings';
  } finally {
    isLoading.value = false;
  }
}

function clearAlerts() {
  error.value = '';
  success.value = '';
}

async function saveCloudflare() {
  clearAlerts();

  if (!cfApiKey.value || !cfAccountId.value || !cfDomain.value) {
    error.value = 'API Token, Account ID, and Domain are required';
    return;
  }

  isSaving.value = true;
  try {
    const result = await api.setupCloudflare({
      apiKey: cfApiKey.value,
      accountId: cfAccountId.value,
      domain: cfDomain.value,
      destinationEmail: cfDestinationEmail.value || undefined,
    });

    cfDnsRecords.value = result.dnsRecords as DNSRecord[];
    success.value = result.message;
    await loadData();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to setup Cloudflare';
  } finally {
    isSaving.value = false;
  }
}

async function saveBrevo() {
  clearAlerts();

  if (!brevoApiKey.value) {
    error.value = 'API Key is required';
    return;
  }

  isSaving.value = true;
  try {
    const result = await api.setupBrevo({
      apiKey: brevoApiKey.value,
    });

    if (result.account) {
      brevoAccountEmail.value = result.account.email;
    }
    success.value = result.message;
    await loadData();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to setup Brevo';
  } finally {
    isSaving.value = false;
  }
}

async function addAddress() {
  clearAlerts();

  if (!newAddress.value) {
    error.value = 'Email address is required';
    return;
  }

  isSaving.value = true;
  try {
    await api.addAddress({
      address: newAddress.value,
      displayName: newDisplayName.value || undefined,
      isDefault: addresses.value.length === 0,
    });

    newAddress.value = '';
    newDisplayName.value = '';
    success.value = 'Address added';
    await loadData();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to add address';
  } finally {
    isSaving.value = false;
  }
}

async function deleteAddress(id: string) {
  if (!confirm('Delete this address?')) return;

  try {
    await api.deleteAddress(id);
    await loadData();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to delete address';
  }
}

async function changePassword() {
  clearAlerts();

  if (!currentPassword.value || !newPassword.value) {
    error.value = 'Current and new password are required';
    return;
  }

  if (newPassword.value.length < 8) {
    error.value = 'New password must be at least 8 characters';
    return;
  }

  if (newPassword.value !== confirmPassword.value) {
    error.value = 'Passwords do not match';
    return;
  }

  isSaving.value = true;
  try {
    await api.changePassword(currentPassword.value, newPassword.value);
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
    success.value = 'Password changed';
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to change password';
  } finally {
    isSaving.value = false;
  }
}

async function addPasskey() {
  clearAlerts();
  isAddingPasskey.value = true;

  try {
    await authStore.registerPasskey(passkeyName.value || undefined);
    passkeyName.value = '';
    success.value = 'Passkey added. You can now sign in without a password.';
    await loadData();
  } catch (e) {
    // A cancelled browser prompt is not an error worth showing
    if (e instanceof Error && e.name !== 'NotAllowedError') {
      error.value = e.message || 'Failed to add passkey';
    }
  } finally {
    isAddingPasskey.value = false;
  }
}

async function deletePasskey(id: string) {
  if (!confirm('Remove this passkey? You can still sign in with your password.')) return;

  try {
    await api.deletePasskey(id);
    await loadData();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to remove passkey';
  }
}

async function completeSetup() {
  clearAlerts();
  isSaving.value = true;

  try {
    await api.completeSetup();
    success.value = 'Setup completed';
    await loadData();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to complete setup';
  } finally {
    isSaving.value = false;
  }
}

async function fixEmailRouting() {
  clearAlerts();
  isSaving.value = true;

  try {
    const result = await api.fixWorkerRouting();
    success.value = result.message || 'Email routing now points at the worker.';
    await loadData();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to fix email routing';
  } finally {
    isSaving.value = false;
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
}
</script>

<template>
  <div class="p-8 max-w-4xl">
    <h1 class="page-title">Make it yours.</h1>
    <p class="text-sm text-ink-2 mt-2 mb-8">Your domain, your connections, your preferences.</p>

    <!-- Loading state -->
    <div v-if="isLoading" class="flex justify-center py-12">
      <div class="spinner"></div>
    </div>

    <template v-else>
      <!-- Alerts -->
      <div v-if="error" role="alert" class="alert-error mb-6">{{ error }}</div>
      <div v-if="success" role="status" class="alert-success mb-6">{{ success }}</div>

      <!-- Complete setup banner -->
      <div
        v-if="setupStatus?.cloudflare.configured && setupStatus?.brevo.configured && !setupStatus?.setupCompleted"
        class="card mb-6 p-4 bg-accent-soft border-accent"
      >
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-medium text-accent">Ready to complete setup</h3>
            <p class="mt-1 text-sm text-ink-2">All services are connected. Finalize to finish onboarding.</p>
          </div>
          <button class="btn btn-primary" :disabled="isSaving" @click="completeSetup">
            Complete setup
          </button>
        </div>
      </div>

      <!-- Tabs -->
      <div class="border-b border-edge mb-6">
        <nav aria-label="Settings sections" class="-mb-px flex gap-6 overflow-x-auto">
          <button
            v-for="tab in (['cloudflare', 'brevo', 'telegram', 'addresses', 'security'] as const)"
            :key="tab"
            class="py-3 px-1 border-b-2 font-medium text-sm capitalize transition-colors"
            :class="activeTab === tab
              ? 'border-accent text-accent'
              : 'border-transparent text-ink-3 hover:text-ink-2'"
            :aria-pressed="activeTab === tab"
            @click="activeTab = tab; clearAlerts()"
          >
            {{ tab }}
          </button>
        </nav>
      </div>

      <section v-if="activeTab === 'telegram'" class="card p-6 md:p-8" aria-labelledby="telegram-heading">
        <div class="connection-heading">
          <div class="telegram-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.4 3.6 18 20c-.3 1.2-1 1.5-2 .9l-5.2-3.8-2.5 2.4c-.3.3-.5.5-1 .5l.4-5.3L17.4 6c.4-.4-.1-.6-.6-.3L4.8 13.3l-5-1.6c-1.1-.3-1.1-1.1.2-1.6L19.5 2.6c.9-.3 1.7.2 1.9 1z"/></svg></div>
          <div><h2 id="telegram-heading" class="text-xl font-semibold">Your inbox. Now on Telegram.</h2><p class="text-sm text-ink-2 mt-1">Receive new mail directly in a private conversation with your bot.</p></div>
        </div>
        <ol class="telegram-steps text-sm text-ink-2 my-6 space-y-2">
          <li>1. Create a bot with <a class="text-accent underline" href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer">@BotFather</a> and copy its token.</li>
          <li>2. Open your bot in Telegram and press Start. Bots cannot message you first.</li>
          <li>3. Enter your numeric user ID, save, then send a test message.</li>
        </ol>
        <form class="space-y-5" @submit.prevent="saveTelegram">
          <div><label for="telegram-token" class="label">Bot token</label>
            <input id="telegram-token" v-model="telegramToken" type="password" autocomplete="off" spellcheck="false" class="input" :placeholder="settings?.telegram_bot_token ? 'Token saved · leave blank to keep it' : '123456789:AA…'" aria-describedby="telegram-token-help" />
            <p id="telegram-token-help" class="hint">Stored on the server and never returned to your browser. Enter a new token to replace it.</p>
          </div>
          <div><label for="telegram-chat" class="label">Recipient's numeric user ID</label>
            <input id="telegram-chat" v-model="telegramChatId" type="text" inputmode="numeric" pattern="[1-9][0-9]{0,15}" placeholder="123456789" class="input" />
          </div>
          <label class="flex items-start gap-3 text-sm"><input v-model="telegramEnabled" type="checkbox" class="mt-1 h-4 w-4 accent-[var(--c-accent)]" /><span><strong class="block font-medium">Forward incoming emails to Telegram</strong><span class="text-ink-2">Sender, recipient, subject and plain-text content will be shared with Telegram. Attachments stay in Qmail; very long emails are shortened.</span></span></label>
          <div class="flex flex-wrap gap-3 pt-2"><button class="btn btn-primary" type="submit" :disabled="isSaving || isTestingTelegram">{{ isSaving ? 'Saving…' : 'Save Telegram settings' }}</button>
            <button class="btn btn-ghost" type="button" :disabled="isSaving || isTestingTelegram || !settings?.telegram_bot_token || !!telegramToken || telegramChatId !== settings?.telegram_chat_id" @click="testTelegram">{{ isTestingTelegram ? 'Sending…' : 'Send test message' }}</button></div>
          <p class="hint">The test uses saved settings. Save any changes first. Disable forwarding and save to pause delivery.</p>
        </form>
        <p v-if="settings?.telegram_last_delivery" class="mt-5 text-sm text-success">Last delivery: {{ new Date(settings.telegram_last_delivery).toLocaleString() }}</p>
        <p v-if="settings?.telegram_last_error" class="alert-error mt-4">{{ settings.telegram_last_error }}</p>
      </section>

      <!-- Cloudflare Tab -->
      <div v-if="activeTab === 'cloudflare'" class="card p-6">
        <h2 class="text-lg font-semibold text-ink mb-4">Cloudflare Email Routing</h2>

        <div v-if="setupStatus?.cloudflare.configured" class="mb-4 p-4 bg-success-soft rounded-lg">
          <div class="flex items-center justify-between">
            <p class="text-sm text-success">Cloudflare is connected for <span class="font-mono">{{ setupStatus.domain }}</span></p>
            <button
              class="btn btn-ghost !py-1 !px-3 text-xs"
              :disabled="isSaving"
              title="Click if emails aren't reaching the worker"
              @click="fixEmailRouting"
            >
              Fix email routing
            </button>
          </div>
        </div>

        <form class="space-y-4" @submit.prevent="saveCloudflare">
          <div>
            <label class="label">API Token</label>
            <input v-model="cfApiKey" type="password" placeholder="Enter Cloudflare API Token" class="input" />
            <p class="hint">Create a token with Email Routing permissions at Cloudflare Dashboard → My Profile → API Tokens</p>
          </div>

          <div>
            <label class="label">Account ID</label>
            <input v-model="cfAccountId" type="text" placeholder="Enter Cloudflare Account ID" class="input" />
          </div>

          <div>
            <label class="label">Domain</label>
            <input v-model="cfDomain" type="text" placeholder="example.com" class="input" />
          </div>

          <div>
            <label class="label">
              Forwarding email <span class="text-ink-3 font-normal">(optional)</span>
            </label>
            <input v-model="cfDestinationEmail" type="email" placeholder="your-real-email@gmail.com" class="input" />
            <p class="hint">If set, received mail is also forwarded there as a backup</p>
          </div>

          <button type="submit" :disabled="isSaving" class="btn btn-primary">
            {{ isSaving ? 'Saving…' : 'Save Cloudflare settings' }}
          </button>
        </form>

        <!-- DNS Records -->
        <div v-if="cfDnsRecords.length > 0" class="mt-6">
          <h3 class="text-sm font-medium text-ink mb-2">Required DNS records</h3>
          <div class="overflow-x-auto rounded-lg border border-edge">
            <table class="min-w-full divide-y divide-edge text-sm">
              <thead class="bg-surface-2">
                <tr>
                  <th class="px-4 py-2 text-left text-xs font-medium text-ink-3">Type</th>
                  <th class="px-4 py-2 text-left text-xs font-medium text-ink-3">Name</th>
                  <th class="px-4 py-2 text-left text-xs font-medium text-ink-3">Value</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-edge">
                <tr v-for="(record, i) in cfDnsRecords" :key="i">
                  <td class="px-4 py-2 text-ink">{{ record.type || record.record_type }}</td>
                  <td class="px-4 py-2 text-ink-2 font-mono text-xs">{{ record.name }}</td>
                  <td class="px-4 py-2 text-ink-2 font-mono text-xs truncate max-w-xs">{{ record.content || record.value }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Brevo Tab -->
      <div v-if="activeTab === 'brevo'" class="card p-6">
        <h2 class="text-lg font-semibold text-ink mb-4">Brevo (sending)</h2>

        <div v-if="setupStatus?.brevo.configured" class="mb-4 p-4 bg-success-soft rounded-lg">
          <p class="text-sm text-success">Brevo is connected</p>
        </div>

        <form class="space-y-4" @submit.prevent="saveBrevo">
          <div>
            <label class="label">API Key</label>
            <input v-model="brevoApiKey" type="password" placeholder="Enter Brevo API Key" class="input" />
            <p class="hint">Get one from Brevo Dashboard → SMTP &amp; API → API Keys</p>
          </div>

          <button type="submit" :disabled="isSaving" class="btn btn-primary">
            {{ isSaving ? 'Saving…' : 'Save Brevo settings' }}
          </button>
        </form>

        <div class="mt-6 p-4 bg-accent-soft rounded-lg">
          <h3 class="text-sm font-medium text-accent mb-1">Domain setup</h3>
          <p class="text-xs text-ink-2">
            To send from your domain, add and verify it in the
            <a href="https://app.brevo.com/senders/domain/list" target="_blank" rel="noopener noreferrer" class="underline text-accent">Brevo dashboard</a>.
          </p>
        </div>
      </div>

      <!-- Addresses Tab -->
      <div v-if="activeTab === 'addresses'" class="card p-6">
        <h2 class="text-lg font-semibold text-ink mb-4">Email addresses</h2>

        <!-- Add new address -->
        <form class="mb-6 p-4 bg-surface-2 rounded-lg" @submit.prevent="addAddress">
          <h3 class="text-sm font-medium text-ink-2 mb-3">Add address</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input v-model="newAddress" type="email" placeholder="contact@yourdomain.com" class="input" />
            <input v-model="newDisplayName" type="text" placeholder="Display name (optional)" class="input" />
          </div>
          <button type="submit" :disabled="isSaving" class="btn btn-primary mt-3">
            Add address
          </button>
        </form>

        <!-- Address list -->
        <div v-if="addresses.length > 0">
          <ul class="divide-y divide-edge">
            <li v-for="addr in addresses" :key="addr.id" class="py-4 flex items-center justify-between">
              <div class="min-w-0">
                <p class="text-sm font-medium text-ink truncate">
                  {{ addr.display_name ? `${addr.display_name} <${addr.address}>` : addr.address }}
                </p>
                <p class="text-xs text-ink-3">Added {{ formatDate(addr.created_at) }}</p>
              </div>
              <div class="flex items-center space-x-3">
                <span v-if="addr.is_default" class="badge bg-accent-soft text-accent">Default</span>
                <button class="text-danger hover:opacity-80 text-sm" @click="deleteAddress(addr.id)">
                  Delete
                </button>
              </div>
            </li>
          </ul>
        </div>
        <p v-else class="text-ink-3 text-sm">No addresses yet.</p>
      </div>

      <!-- Security Tab -->
      <div v-if="activeTab === 'security'" class="space-y-6">
        <!-- Passkeys -->
        <div class="card p-6">
          <h2 class="text-lg font-semibold text-ink mb-1">Passkeys</h2>
          <p class="text-sm text-ink-2 mb-4">
            Sign in with Touch ID, Windows Hello, or a security key instead of your password (FIDO2/WebAuthn).
          </p>

          <div class="flex gap-3 mb-4">
            <input
              v-model="passkeyName"
              type="text"
              placeholder="Name this device (e.g. MacBook)"
              class="input max-w-xs"
              maxlength="64"
            />
            <button class="btn btn-primary flex-shrink-0" :disabled="isAddingPasskey" @click="addPasskey">
              <span v-if="isAddingPasskey" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              {{ isAddingPasskey ? 'Waiting…' : 'Add passkey' }}
            </button>
          </div>

          <ul v-if="passkeys.length > 0" class="divide-y divide-edge">
            <li v-for="key in passkeys" :key="key.id" class="py-3 flex items-center justify-between">
              <div class="flex items-center min-w-0">
                <svg class="w-5 h-5 text-ink-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                <div class="ml-3 min-w-0">
                  <p class="text-sm font-medium text-ink truncate">{{ key.deviceName || 'Unnamed passkey' }}</p>
                  <p class="text-xs text-ink-3">
                    Added {{ formatDate(key.createdAt) }}
                    <template v-if="key.lastUsedAt"> · Last used {{ formatDate(key.lastUsedAt) }}</template>
                  </p>
                </div>
              </div>
              <button class="text-danger hover:opacity-80 text-sm flex-shrink-0" @click="deletePasskey(key.id)">
                Remove
              </button>
            </li>
          </ul>
          <p v-else class="text-sm text-ink-3">No passkeys yet. Add one to enable passwordless sign-in.</p>
        </div>

        <!-- Notifications -->
        <div class="card p-6">
          <h2 class="text-lg font-semibold text-ink mb-1">Notifications</h2>
          <p class="text-sm text-ink-2 mb-4">
            Get a browser push notification when new mail arrives. No message content is sent through the push service.
          </p>
          <button v-if="pushSupported" class="btn" :class="pushEnabled ? 'btn-ghost' : 'btn-primary'" :disabled="isTogglingPush" @click="togglePush">
            <span v-if="isTogglingPush" class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
            {{ pushEnabled ? 'Disable notifications on this device' : 'Enable notifications on this device' }}
          </button>
          <p v-else class="text-sm text-ink-3">This browser doesn't support push notifications.</p>
        </div>

        <!-- Privacy -->
        <div class="card p-6">
          <h2 class="text-lg font-semibold text-ink mb-1">Privacy</h2>
          <p class="text-sm text-ink-2 mb-4">
            Blocking remote images stops senders from tracking when you open a message. You can reveal images per email.
          </p>
          <div class="flex items-center justify-between gap-4 max-w-md">
            <span id="block-images-label" class="text-sm text-ink">Block remote images in received mail</span>
            <button
              type="button"
              role="switch"
              :aria-checked="blockRemoteImages"
              aria-labelledby="block-images-label"
              class="switch flex-shrink-0"
              :class="blockRemoteImages ? 'switch-on' : 'switch-off'"
              @click="toggleBlockImages"
            >
              <span class="switch-handle"></span>
            </button>
          </div>
        </div>

        <!-- Export -->
        <div class="card p-6">
          <h2 class="text-lg font-semibold text-ink mb-1">Backup</h2>
          <p class="text-sm text-ink-2 mb-4">
            Download your entire mailbox (including attachments) as a standard mbox file that any mail client can import.
          </p>
          <button class="btn btn-ghost" :disabled="isExporting" @click="exportMbox">
            <span v-if="isExporting" class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
            {{ isExporting ? 'Preparing export…' : 'Download mbox export' }}
          </button>
        </div>

        <!-- Change password -->
        <div class="card p-6">
          <h2 class="text-lg font-semibold text-ink mb-4">Change password</h2>

          <form class="space-y-4 max-w-md" @submit.prevent="changePassword">
            <div>
              <label class="label">Current password</label>
              <input v-model="currentPassword" type="password" autocomplete="current-password" class="input" />
            </div>

            <div>
              <label class="label">New password</label>
              <input v-model="newPassword" type="password" minlength="8" autocomplete="new-password" class="input" />
            </div>

            <div>
              <label class="label">Confirm new password</label>
              <input v-model="confirmPassword" type="password" autocomplete="new-password" class="input" />
            </div>

            <button type="submit" :disabled="isSaving" class="btn btn-primary">
              {{ isSaving ? 'Changing…' : 'Change password' }}
            </button>
          </form>
        </div>
      </div>
    </template>
  </div>
</template>
