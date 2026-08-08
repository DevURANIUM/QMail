<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '@/api/client';
import type { Settings, SetupStatus, Address, DNSRecord } from '@/api/types';

const activeTab = ref<'cloudflare' | 'brevo' | 'addresses' | 'account'>('cloudflare');
const isLoading = ref(true);
const isSaving = ref(false);
const error = ref('');
const success = ref('');

// Settings data
const settings = ref<Settings | null>(null);
const setupStatus = ref<SetupStatus | null>(null);
const addresses = ref<Address[]>([]);

// Cloudflare form
const cfApiKey = ref('');
const cfAccountId = ref('');
const cfDomain = ref('');
const cfDestinationEmail = ref('');
const cfDnsRecords = ref<DNSRecord[]>([]);

// Brevo form
const brevoApiKey = ref('');
const brevoAccountEmail = ref('');

// Address form
const newAddress = ref('');
const newDisplayName = ref('');

// Password form
const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');

onMounted(async () => {
  await loadData();
});

async function loadData() {
  isLoading.value = true;
  try {
    const [sett, status, addrs] = await Promise.all([
      api.getSettings(),
      api.getSetupStatus(),
      api.getAddresses(),
    ]);

    settings.value = sett;
    setupStatus.value = status;
    addresses.value = addrs;

    // Populate form fields
    cfDomain.value = sett.domain || '';
    cfDestinationEmail.value = sett.destination_email || '';
  } catch (e) {
    error.value = 'Failed to load settings';
  } finally {
    isLoading.value = false;
  }
}

async function saveCloudflare() {
  error.value = '';
  success.value = '';

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
  error.value = '';
  success.value = '';

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
  error.value = '';
  success.value = '';

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
    success.value = 'Address added successfully';
    await loadData();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to add address';
  } finally {
    isSaving.value = false;
  }
}

async function deleteAddress(id: string) {
  if (!confirm('Are you sure you want to delete this address?')) return;

  try {
    await api.deleteAddress(id);
    await loadData();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to delete address';
  }
}

async function changePassword() {
  error.value = '';
  success.value = '';

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
    success.value = 'Password changed successfully';
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to change password';
  } finally {
    isSaving.value = false;
  }
}

async function completeSetup() {
  error.value = '';
  success.value = '';
  isSaving.value = true;

  try {
    await api.completeSetup();
    success.value = 'Setup completed successfully!';
    await loadData();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to complete setup';
  } finally {
    isSaving.value = false;
  }
}

async function fixEmailRouting() {
  error.value = '';
  success.value = '';
  isSaving.value = true;

  try {
    const result = await api.fixWorkerRouting();
    success.value = result.message || 'Email routing fixed successfully! Emails will now be processed by the worker.';
    await loadData();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to fix email routing';
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <div class="qm-page max-w-6xl mx-auto">
    <p class="text-xs font-bold tracking-[.2em] uppercase text-primary-600">QMail</p>
    <h1 class="qm-title mt-1">Settings</h1>
    <p class="qm-subtitle mb-6">Manage delivery, identities and account security.</p>

    <!-- Loading state -->
    <div v-if="isLoading" class="flex justify-center py-12">
      <div class="spinner"></div>
    </div>

    <template v-else>
      <!-- Alerts -->
      <div v-if="error" class="mb-6 rounded-md bg-red-50 p-4">
        <p class="text-sm font-medium text-red-800">{{ error }}</p>
      </div>

      <div v-if="success" class="mb-6 rounded-md bg-green-50 p-4">
        <p class="text-sm font-medium text-green-800">{{ success }}</p>
      </div>

      <!-- Complete setup banner -->
      <div
        v-if="setupStatus?.cloudflare.configured && setupStatus?.brevo.configured && !setupStatus?.setupCompleted"
        class="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4"
      >
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-medium text-blue-800">Ready to complete setup</h3>
            <p class="mt-1 text-sm text-blue-700">All services are configured. Click to finalize.</p>
          </div>
          <button
            @click="completeSetup"
            :disabled="isSaving"
            class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Complete Setup
          </button>
        </div>
      </div>

      <!-- Tabs -->
      <div class="border-b border-gray-200 mb-6 overflow-x-auto">
        <nav class="-mb-px flex gap-6 min-w-max">
          <button
            v-for="tab in ['cloudflare', 'brevo', 'addresses', 'account']"
            :key="tab"
            @click="activeTab = tab as typeof activeTab"
            class="py-4 px-1 border-b-2 font-medium text-sm capitalize"
            :class="activeTab === tab
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
          >
            {{ tab }}
          </button>
        </nav>
      </div>

      <!-- Cloudflare Tab -->
      <div v-if="activeTab === 'cloudflare'" class="qm-card p-5 sm:p-7">
        <h2 class="text-lg font-medium text-gray-900 mb-4">Cloudflare Email Routing</h2>

        <div v-if="setupStatus?.cloudflare.configured" class="mb-4 p-4 bg-green-50 rounded-lg">
          <div class="flex items-center justify-between">
            <p class="text-sm text-green-800">Cloudflare is configured for {{ setupStatus.domain }}</p>
            <button
              @click="fixEmailRouting"
              :disabled="isSaving"
              class="px-3 py-1 text-xs font-medium text-green-700 bg-green-100 rounded hover:bg-green-200 disabled:opacity-50"
              title="Click if emails aren't being received by the worker"
            >
              Fix Email Routing
            </button>
          </div>
        </div>

        <form @submit.prevent="saveCloudflare" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">API Token</label>
            <input
              v-model="cfApiKey"
              type="password"
              placeholder="Enter Cloudflare API Token"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
            <p class="mt-1 text-xs text-gray-500">Create a token with Email Routing permissions at Cloudflare Dashboard > My Profile > API Tokens</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Account ID</label>
            <input
              v-model="cfAccountId"
              type="text"
              placeholder="Enter Cloudflare Account ID"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Domain</label>
            <input
              v-model="cfDomain"
              type="text"
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
            class="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {{ isSaving ? 'Saving...' : 'Save Cloudflare Settings' }}
          </button>
        </form>

        <!-- DNS Records -->
        <div v-if="cfDnsRecords.length > 0" class="mt-6">
          <h3 class="text-sm font-medium text-gray-900 mb-2">Required DNS Records</h3>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Type</th>
                  <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Name</th>
                  <th class="px-4 py-2 text-left text-xs font-medium text-gray-500">Value</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                <tr v-for="(record, i) in cfDnsRecords" :key="i">
                  <td class="px-4 py-2 text-sm text-gray-900">{{ record.type || record.record_type }}</td>
                  <td class="px-4 py-2 text-sm text-gray-500">{{ record.name }}</td>
                  <td class="px-4 py-2 text-sm text-gray-500 truncate max-w-xs">{{ record.content || record.value }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Brevo Tab -->
      <div v-if="activeTab === 'brevo'" class="qm-card p-5 sm:p-7">
        <h2 class="text-lg font-medium text-gray-900 mb-4">Brevo (Sending)</h2>

        <div v-if="setupStatus?.brevo.configured" class="mb-4 p-4 bg-green-50 rounded-lg">
          <p class="text-sm text-green-800">Brevo is configured</p>
        </div>

        <form @submit.prevent="saveBrevo" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">API Key</label>
            <input
              v-model="brevoApiKey"
              type="password"
              placeholder="Enter Brevo API Key"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
            <p class="mt-1 text-xs text-gray-500">Get from Brevo Dashboard > SMTP & API > API Keys</p>
          </div>

          <button
            type="submit"
            :disabled="isSaving"
            class="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {{ isSaving ? 'Saving...' : 'Save Brevo Settings' }}
          </button>
        </form>

        <div class="mt-6 p-4 bg-blue-50 rounded-lg">
          <h3 class="text-sm font-medium text-blue-800 mb-2">Domain Setup</h3>
          <p class="text-xs text-blue-700">
            To send emails from your domain, add and verify your domain in the
            <a href="https://app.brevo.com/senders/domain/list" target="_blank" class="underline">Brevo Dashboard</a>.
          </p>
        </div>
      </div>

      <!-- Addresses Tab -->
      <div v-if="activeTab === 'addresses'" class="qm-card p-5 sm:p-7">
        <h2 class="text-lg font-medium text-gray-900 mb-4">Email Addresses</h2>

        <!-- Add new address -->
        <form @submit.prevent="addAddress" class="mb-6 p-4 bg-gray-50 rounded-lg">
          <h3 class="text-sm font-medium text-gray-700 mb-3">Add New Address</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <input
                v-model="newAddress"
                type="email"
                placeholder="contact@yourdomain.com"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <input
                v-model="newDisplayName"
                type="text"
                placeholder="Display Name (optional)"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
          <button
            type="submit"
            :disabled="isSaving"
            class="mt-3 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            Add Address
          </button>
        </form>

        <!-- Address list -->
        <div v-if="addresses.length > 0">
          <ul class="divide-y divide-gray-200">
            <li v-for="addr in addresses" :key="addr.id" class="py-4 flex items-center justify-between">
              <div>
                <p class="text-sm font-medium text-gray-900">
                  {{ addr.display_name ? `${addr.display_name} <${addr.address}>` : addr.address }}
                </p>
                <p class="text-xs text-gray-500">Added {{ new Date(addr.created_at).toLocaleDateString() }}</p>
              </div>
              <div class="flex items-center space-x-2">
                <span v-if="addr.is_default" class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary-100 text-primary-800">
                  Default
                </span>
                <button
                  @click="deleteAddress(addr.id)"
                  class="text-red-600 hover:text-red-800 text-sm"
                >
                  Delete
                </button>
              </div>
            </li>
          </ul>
        </div>
        <p v-else class="text-gray-500 text-sm">No addresses configured yet.</p>
      </div>

      <!-- Account Tab -->
      <div v-if="activeTab === 'account'" class="qm-card p-5 sm:p-7">
        <h2 class="text-lg font-medium text-gray-900 mb-4">Change Password</h2>

        <form @submit.prevent="changePassword" class="space-y-4 max-w-md">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
            <input
              v-model="currentPassword"
              type="password"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <input
              v-model="newPassword"
              type="password"
              minlength="8"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
            <input
              v-model="confirmPassword"
              type="password"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <button
            type="submit"
            :disabled="isSaving"
            class="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {{ isSaving ? 'Changing...' : 'Change Password' }}
          </button>
        </form>
      </div>
    </template>
  </div>
</template>
