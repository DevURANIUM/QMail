<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useEmailsStore } from '@/stores/emails';
import api from '@/api/client';
import type { Address, Settings } from '@/api/types';

const route = useRoute();
const router = useRouter();
const emailsStore = useEmailsStore();

const from = ref('');
const to = ref('');
const cc = ref('');
const bcc = ref('');
const subject = ref('');
const body = ref('');
const showCc = ref(false);
const showBcc = ref(false);
const isSending = ref(false);
const error = ref('');
const addresses = ref<Address[]>([]);
const settings = ref<Settings | null>(null);

// Attachments
interface AttachmentFile {
  file: File;
  name: string;
  size: number;
  type: string;
  content: string; // Base64
}
const attachments = ref<AttachmentFile[]>([]);
const fileInputRef = ref<HTMLInputElement | null>(null);
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024; // 5MB per file
const MAX_TOTAL_SIZE = 10 * 1024 * 1024; // 10MB total

onMounted(async () => {
  // Load addresses and settings
  try {
    const [addrs, sett] = await Promise.all([
      api.getAddresses(),
      api.getSettings(),
    ]);
    addresses.value = addrs;
    settings.value = sett;

    // Set default from address
    const defaultAddr = addrs.find(a => a.is_default);
    if (defaultAddr) {
      from.value = defaultAddr.address;
    } else if (addrs.length > 0) {
      from.value = addrs[0].address;
    } else if (sett.domain) {
      from.value = `noreply@${sett.domain}`;
    }
  } catch (e) {
    console.error('Failed to load addresses:', e);
  }

  // Handle reply
  if (route.query.to) {
    to.value = route.query.to as string;
  }
  if (route.query.subject) {
    subject.value = route.query.subject as string;
  }
});

async function sendEmail() {
  error.value = '';

  if (!from.value || !to.value || !subject.value) {
    error.value = 'From, To, and Subject are required';
    return;
  }

  if (!body.value.trim()) {
    error.value = 'Email body is required';
    return;
  }

  isSending.value = true;

  try {
    // Prepare attachments for API
    const attachmentData = attachments.value.map(att => ({
      filename: att.name,
      content: att.content,
      contentType: att.type || 'application/octet-stream',
    }));

    const escapedBody = body.value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    await emailsStore.sendEmail({
      from: from.value,
      to: to.value,
      cc: cc.value || undefined,
      bcc: bcc.value || undefined,
      subject: subject.value,
      text: body.value,
      html: `<p>${escapedBody.replace(/\r?\n/g, '<br>')}</p>`,
      attachments: attachmentData.length > 0 ? attachmentData : undefined,
    });

    router.push({ name: 'sent' });
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to send email';
  } finally {
    isSending.value = false;
  }
}

function cancel() {
  router.back();
}

// Attachment handling
function triggerFileInput() {
  fileInputRef.value?.click();
}

async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (!files || files.length === 0) return;

  for (const file of Array.from(files)) {
    // Check individual file size
    if (file.size > MAX_ATTACHMENT_SIZE) {
      error.value = `File "${file.name}" exceeds maximum size of 5MB`;
      continue;
    }

    // Check total size
    const currentTotal = attachments.value.reduce((sum, att) => sum + att.size, 0);
    if (currentTotal + file.size > MAX_TOTAL_SIZE) {
      error.value = 'Total attachment size exceeds 10MB limit';
      break;
    }

    // Check for duplicates
    if (attachments.value.some(att => att.name === file.name)) {
      continue;
    }

    // Read file as base64
    const content = await readFileAsBase64(file);
    attachments.value.push({
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      content,
    });
  }

  // Reset input
  input.value = '';
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function removeAttachment(index: number) {
  attachments.value.splice(index, 1);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getTotalAttachmentSize(): number {
  return attachments.value.reduce((sum, att) => sum + att.size, 0);
}
</script>

<template>
  <div class="qm-page max-w-5xl mx-auto">
    <p class="text-xs font-bold tracking-[.2em] uppercase text-primary-600">Create</p>
    <h1 class="qm-title mt-1">New message</h1>
    <p class="qm-subtitle mb-6">Write and send securely from your QMail address.</p>

    <div class="qm-card">
      <form @submit.prevent="sendEmail" class="p-5 sm:p-7 space-y-5">
        <!-- From -->
        <div>
          <label for="from" class="block text-sm font-medium text-gray-700 mb-1">From</label>
          <select
            v-if="addresses.length > 0"
            id="from"
            v-model="from"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
          >
            <option v-for="addr in addresses" :key="addr.id" :value="addr.address">
              {{ addr.display_name ? `${addr.display_name} <${addr.address}>` : addr.address }}
            </option>
          </select>
          <input
            v-else
            id="from"
            v-model="from"
            type="email"
            placeholder="your-email@yourdomain.com"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        <!-- To -->
        <div>
          <label for="to" class="block text-sm font-medium text-gray-700 mb-1">To</label>
          <div class="flex items-center">
            <input
              id="to"
              v-model="to"
              type="email"
              required
              placeholder="recipient@example.com"
              class="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
            />
            <button
              type="button"
              @click="showCc = !showCc"
              class="ml-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Cc
            </button>
            <button
              type="button"
              @click="showBcc = !showBcc"
              class="ml-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Bcc
            </button>
          </div>
        </div>

        <!-- CC -->
        <div v-if="showCc">
          <label for="cc" class="block text-sm font-medium text-gray-700 mb-1">Cc</label>
          <input
            id="cc"
            v-model="cc"
            type="email"
            placeholder="cc@example.com"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        <!-- BCC -->
        <div v-if="showBcc">
          <label for="bcc" class="block text-sm font-medium text-gray-700 mb-1">Bcc</label>
          <input
            id="bcc"
            v-model="bcc"
            type="email"
            placeholder="bcc@example.com"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        <!-- Subject -->
        <div>
          <label for="subject" class="block text-sm font-medium text-gray-700 mb-1">Subject</label>
          <input
            id="subject"
            v-model="subject"
            type="text"
            required
            placeholder="Email subject"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        <!-- Body -->
        <div>
          <label for="body" class="block text-sm font-medium text-gray-700 mb-1">Message</label>
          <textarea
            id="body"
            v-model="body"
            rows="12"
            required
            placeholder="Write your message here..."
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500 resize-none"
          ></textarea>
        </div>

        <!-- Attachments -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="block text-sm font-medium text-gray-700">Attachments</label>
            <span v-if="attachments.length > 0" class="text-xs text-gray-500">
              {{ formatFileSize(getTotalAttachmentSize()) }} / 10 MB
            </span>
          </div>

          <!-- Hidden file input -->
          <input
            ref="fileInputRef"
            type="file"
            multiple
            class="hidden"
            @change="handleFileSelect"
          />

          <!-- Add attachment button -->
          <button
            type="button"
            @click="triggerFileInput"
            class="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-primary-500 hover:text-primary-500 transition-colors flex items-center justify-center"
          >
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            Add attachments (max 5MB per file)
          </button>

          <!-- Attachment list -->
          <div v-if="attachments.length > 0" class="mt-3 space-y-2">
            <div
              v-for="(att, index) in attachments"
              :key="att.name"
              class="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div class="flex items-center min-w-0">
                <svg class="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                <span class="ml-2 text-sm text-gray-900 truncate">{{ att.name }}</span>
                <span class="ml-2 text-xs text-gray-500 flex-shrink-0">({{ formatFileSize(att.size) }})</span>
              </div>
              <button
                type="button"
                @click="removeAttachment(index)"
                class="ml-2 p-1 text-gray-400 hover:text-red-500 flex-shrink-0"
                title="Remove attachment"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Error -->
        <div v-if="error" class="rounded-md bg-red-50 p-4">
          <div class="flex">
            <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
            </svg>
            <p class="ml-3 text-sm font-medium text-red-800">{{ error }}</p>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            @click="cancel"
            class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            :disabled="isSending"
            class="flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg v-if="isSending" class="w-4 h-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <svg v-else class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            {{ isSending ? 'Sending...' : 'Send' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
