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
  <div class="qm-page py-10 sm:py-12">
    <div class="max-w-2xl mx-auto">
      <!-- Header -->
      <div class="text-center mb-8">
        <div class="mx-auto h-16 w-16 bg-primary-500 rounded-2xl flex items-center justify-center mb-4">
          <svg class="h-10 w-10 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
          </svg>
        </div>
        <h1 class="text-2xl font-bold text-gray-900">Setup QMail</h1>
        <p class="mt-2 text-gray-600">Configure your email services to get started</p>
      </div>

      <!-- Progress -->
      <div class="mb-8">
        <div class="flex items-center justify-center space-x-4">
          <div
            v-for="s in 3"
            :key="s"
            class="flex items-center"
          >
            <div
              class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
              :class="step >= s ? 'bg-primary-500 text-white' : 'bg-gray-200 text-gray-500'"
            >
              {{ s }}
            </div>
            <div
              v-if="s < 3"
              class="w-16 h-1 mx-2"
              :class="step > s ? 'bg-primary-500' : 'bg-gray-200'"
            ></div>
          </div>
        </div>
        <div class="flex justify-center mt-2 space-x-12">
          <span class="text-xs text-gray-500">Cloudflare</span>
          <span class="text-xs text-gray-500">Brevo</span>
          <span class="text-xs text-gray-500">Complete</span>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="isLoading" class="flex justify-center py-12">
        <div class="spinner"></div>
      </div>

      <!-- Error -->
      <div v-if="error" class="mb-6 rounded-md bg-red-50 p-4">
        <p class="text-sm font-medium text-red-800">{{ error }}</p>
      </div>

      <!-- Step 1: Cloudflare -->
      <div v-if="!isLoading && step === 1" class="qm-card p-5 sm:p-7">
        <h2 class="text-lg font-medium text-gray-900 mb-4">Step 1: Cloudflare Email Routing</h2>
        <p class="text-sm text-gray-600 mb-6">
          Configure Cloudflare to receive emails on your domain. You'll need a Cloudflare account with your domain added.
        </p>

        <form @submit.prevent="saveCloudflare" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Cloudflare API Token</label>
            <input
              v-model="cfApiKey"
              type="password"
              required
              placeholder="Enter your Cloudflare API token"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
            <p class="mt-1 text-xs text-gray-500">
              <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" class="text-primary-600 hover:underline">
                Create an API token with Email Routing permissions
              </a>
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Account ID</label>
            <input
              v-model="cfAccountId"
              type="text"
              required
              placeholder="Your Cloudflare Account ID"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
            <p class="mt-1 text-xs text-gray-500">Found in your Cloudflare dashboard sidebar</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Domain</label>
            <input
              v-model="cfDomain"
              type="text"
              required
              placeholder="example.com"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Forwarding Email <span class="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              v-model="cfDestinationEmail"
              type="email"
              placeholder="your-real-email@gmail.com"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
            <p class="mt-1 text-xs text-gray-500">If set, emails will also be forwarded to this address as backup</p>
          </div>

          <button
            type="submit"
            :disabled="isSaving"
            class="w-full py-2 px-4 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {{ isSaving ? 'Setting up...' : 'Continue' }}
          </button>
        </form>
      </div>

      <!-- Step 2: Brevo -->
      <div v-if="!isLoading && step === 2" class="qm-card p-5 sm:p-7">
        <h2 class="text-lg font-medium text-gray-900 mb-4">Step 2: Brevo (Sending)</h2>
        <p class="text-sm text-gray-600 mb-6">
          Configure Brevo to send emails from your domain. Create a free Brevo account if you don't have one.
        </p>

        <form @submit.prevent="saveBrevo" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Brevo API Key</label>
            <input
              v-model="brevoApiKey"
              type="password"
              required
              placeholder="Enter your Brevo API key"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
            <p class="mt-1 text-xs text-gray-500">
              <a href="https://app.brevo.com/settings/keys/api" target="_blank" class="text-primary-600 hover:underline">
                Get your API key from Brevo
              </a>
            </p>
          </div>

          <div class="flex space-x-3">
            <button
              type="button"
              @click="step = 1"
              class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="submit"
              :disabled="isSaving"
              class="flex-1 py-2 px-4 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {{ isSaving ? 'Setting up...' : 'Continue' }}
            </button>
          </div>
        </form>

        <div class="mt-6 p-4 bg-blue-50 rounded-lg">
          <h3 class="text-sm font-medium text-blue-800 mb-2">Domain Verification</h3>
          <p class="text-xs text-blue-700">
            After setup, add and verify your sending domain in the
            <a href="https://app.brevo.com/senders/domain/list" target="_blank" class="underline">Brevo Dashboard</a>.
          </p>
        </div>
      </div>

      <!-- Step 3: Complete -->
      <div v-if="!isLoading && step === 3" class="qm-card p-5 sm:p-7">
        <div class="text-center">
          <div class="mx-auto h-12 w-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <svg class="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 class="text-lg font-medium text-gray-900 mb-2">Setup Complete!</h2>
          <p class="text-sm text-gray-600 mb-6">
            Your email services are configured. You can now receive and send emails from your domain.
          </p>

          <div class="mb-6 p-4 bg-gray-50 rounded-lg text-left">
            <h3 class="text-sm font-medium text-gray-700 mb-2">Configuration Summary</h3>
            <dl class="space-y-1 text-sm">
              <div class="flex justify-between">
                <dt class="text-gray-500">Domain:</dt>
                <dd class="text-gray-900">{{ setupStatus?.domain }}</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-gray-500">Receiving:</dt>
                <dd class="text-green-600">Cloudflare Email Routing</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-gray-500">Sending:</dt>
                <dd class="text-green-600">Brevo</dd>
              </div>
            </dl>
          </div>

          <div class="bg-yellow-50 p-4 rounded-lg mb-6">
            <p class="text-sm text-yellow-800">
              <strong>Important:</strong> Make sure to verify your domain in both Cloudflare and Brevo dashboards to complete the setup.
            </p>
          </div>

          <button
            @click="completeSetup"
            :disabled="isSaving"
            class="w-full py-2 px-4 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {{ isSaving ? 'Finishing...' : 'Go to Dashboard' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
