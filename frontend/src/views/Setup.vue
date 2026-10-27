<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import api from '@/api/client';
import type { SetupStatus, DNSRecord } from '@/api/types';

const router = useRouter();

const step = ref(1);
const isLoading = ref(true);
const isSaving = ref(false);
const error = ref('');
const setupStatus = ref<SetupStatus | null>(null);

// Cloudflare form
const cfApiKey = ref('');
const cfAccountId = ref('');
const cfDomain = ref('');
const cfDestinationEmail = ref('');
const cfDnsRecords = ref<DNSRecord[]>([]);

// Brevo form
const brevoApiKey = ref('');

onMounted(async () => {
  await loadStatus();
});

async function loadStatus() {
  isLoading.value = true;
  try {
    setupStatus.value = await api.getSetupStatus();

    if (setupStatus.value.setupCompleted) {
      router.push({ name: 'dashboard' });
      return;
    }

    // Determine current step based on what's configured
    if (setupStatus.value.cloudflare.configured && setupStatus.value.brevo.configured) {
      step.value = 3;
    } else if (setupStatus.value.cloudflare.configured) {
      step.value = 2;
    } else {
      step.value = 1;
    }
  } finally {
    isLoading.value = false;
  }
}

async function saveCloudflare() {
  error.value = '';

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
    step.value = 2;
    await loadStatus();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to setup Cloudflare';
  } finally {
    isSaving.value = false;
  }
}

async function saveBrevo() {
  error.value = '';

  if (!brevoApiKey.value) {
    error.value = 'API Key is required';
    return;
  }

  isSaving.value = true;
  try {
    await api.setupBrevo({
      apiKey: brevoApiKey.value,
    });

    step.value = 3;
    await loadStatus();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to setup Brevo';
  } finally {
    isSaving.value = false;
  }
}

async function completeSetup() {
  isSaving.value = true;
  try {
    await api.completeSetup();
    router.push({ name: 'dashboard' });
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to complete setup';
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-page py-12 px-4">
    <div class="max-w-2xl mx-auto">
      <!-- Header -->
      <div class="text-center mb-8">
        <div class="mx-auto h-14 w-14 bg-accent rounded-2xl flex items-center justify-center mb-4">
          <img src="/favicon.svg" alt="" class="h-full w-full" />
        </div>
        <h1 class="font-display text-3xl text-ink">Set up Qmail</h1>
        <p class="mt-2 text-ink-2">Connect your email services to get started</p>
      </div>

      <!-- Progress -->
      <div class="mb-8">
        <div class="flex items-center justify-center space-x-4">
          <div v-for="s in 3" :key="s" class="flex items-center">
            <div
              class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
              :class="step >= s ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-ink-3'"
            >
              {{ s }}
            </div>
            <div
              v-if="s < 3"
              class="w-16 h-1 mx-2 rounded-full"
              :class="step > s ? 'bg-accent' : 'bg-surface-2'"
            ></div>
          </div>
        </div>
        <div class="flex justify-center mt-2 space-x-12">
          <span class="text-xs text-ink-3">Cloudflare</span>
          <span class="text-xs text-ink-3">Brevo</span>
          <span class="text-xs text-ink-3">Complete</span>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="isLoading" class="flex justify-center py-12">
        <div class="spinner"></div>
      </div>

      <!-- Error -->
      <div v-if="error" class="alert-error mb-6">{{ error }}</div>

      <!-- Step 1: Cloudflare -->
      <div v-if="!isLoading && step === 1" class="card p-6">
        <h2 class="text-lg font-semibold text-ink mb-2">Step 1: Cloudflare Email Routing</h2>
        <p class="text-sm text-ink-2 mb-6">
          Cloudflare receives mail for your domain. You'll need an account with the domain added.
        </p>

        <form class="space-y-4" @submit.prevent="saveCloudflare">
          <div>
            <label class="label">Cloudflare API Token</label>
            <input v-model="cfApiKey" type="password" required placeholder="Enter your Cloudflare API token" class="input" />
            <p class="hint">
              <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener noreferrer" class="text-accent hover:underline">
                Create an API token with Email Routing permissions
              </a>
            </p>
          </div>

          <div>
            <label class="label">Account ID</label>
            <input v-model="cfAccountId" type="text" required placeholder="Your Cloudflare Account ID" class="input" />
            <p class="hint">Found in your Cloudflare dashboard sidebar</p>
          </div>

          <div>
            <label class="label">Domain</label>
            <input v-model="cfDomain" type="text" required placeholder="example.com" class="input" />
          </div>

          <div>
            <label class="label">
              Forwarding email <span class="text-ink-3 font-normal">(optional)</span>
            </label>
            <input v-model="cfDestinationEmail" type="email" placeholder="your-real-email@gmail.com" class="input" />
            <p class="hint">If set, received mail is also forwarded there as a backup</p>
          </div>

          <button type="submit" :disabled="isSaving" class="btn btn-primary w-full">
            {{ isSaving ? 'Setting up…' : 'Continue' }}
          </button>
        </form>
      </div>

      <!-- Step 2: Brevo -->
      <div v-if="!isLoading && step === 2" class="card p-6">
        <h2 class="text-lg font-semibold text-ink mb-2">Step 2: Brevo (sending)</h2>
        <p class="text-sm text-ink-2 mb-6">
          Brevo sends mail from your domain. A free account is enough to start.
        </p>

        <form class="space-y-4" @submit.prevent="saveBrevo">
          <div>
            <label class="label">Brevo API Key</label>
            <input v-model="brevoApiKey" type="password" required placeholder="Enter your Brevo API key" class="input" />
            <p class="hint">
              <a href="https://app.brevo.com/settings/keys/api" target="_blank" rel="noopener noreferrer" class="text-accent hover:underline">
                Get your API key from Brevo
              </a>
            </p>
          </div>

          <div class="flex space-x-3">
            <button type="button" class="btn btn-ghost" @click="step = 1">Back</button>
            <button type="submit" :disabled="isSaving" class="btn btn-primary flex-1">
              {{ isSaving ? 'Setting up…' : 'Continue' }}
            </button>
          </div>
        </form>

        <div class="mt-6 p-4 bg-accent-soft rounded-lg">
          <h3 class="text-sm font-medium text-accent mb-1">Domain verification</h3>
          <p class="text-xs text-ink-2">
            After setup, add and verify your sending domain in the
            <a href="https://app.brevo.com/senders/domain/list" target="_blank" rel="noopener noreferrer" class="underline text-accent">Brevo dashboard</a>.
          </p>
        </div>
      </div>

      <!-- Step 3: Complete -->
      <div v-if="!isLoading && step === 3" class="card p-6">
        <div class="text-center">
          <div class="mx-auto h-12 w-12 bg-success-soft rounded-full flex items-center justify-center mb-4">
            <svg class="h-6 w-6 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 class="text-lg font-semibold text-ink mb-2">Setup complete</h2>
          <p class="text-sm text-ink-2 mb-6">
            Your email services are connected. You can now send and receive mail on your domain.
          </p>

          <div class="mb-6 p-4 bg-surface-2 rounded-lg text-left">
            <h3 class="text-sm font-medium text-ink-2 mb-2">Configuration summary</h3>
            <dl class="space-y-1 text-sm">
              <div class="flex justify-between">
                <dt class="text-ink-3">Domain</dt>
                <dd class="text-ink font-mono text-xs">{{ setupStatus?.domain }}</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-ink-3">Receiving</dt>
                <dd class="text-success">Cloudflare Email Routing</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-ink-3">Sending</dt>
                <dd class="text-success">Brevo</dd>
              </div>
            </dl>
          </div>

          <div class="bg-warning-soft p-4 rounded-lg mb-6 text-left">
            <p class="text-sm text-warning">
              <strong>Important:</strong> verify your domain in both the Cloudflare and Brevo dashboards to finish DNS setup.
            </p>
          </div>

          <button class="btn btn-primary w-full" :disabled="isSaving" @click="completeSetup">
            {{ isSaving ? 'Finishing…' : 'Go to dashboard' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
