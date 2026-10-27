<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { textDirection } from '@/utils/textDirection';
import SchedulePicker from '@/components/SchedulePicker.vue';
import { useRoute, useRouter } from 'vue-router';
import { useEmailsStore } from '@/stores/emails';
import api from '@/api/client';
import type { Address, Contact, Settings } from '@/api/types';

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
const isSavingDraft = ref(false);
const error = ref('');
const notice = ref('');
const addresses = ref<Address[]>([]);
const settings = ref<Settings | null>(null);
const contacts = ref<Contact[]>([]);

// Context: draft being edited, reply threading, forward source
const draftId = ref<string | null>(null);
const replyToEmailId = ref<string | null>(null);
const forwardOfEmailId = ref<string | null>(null);

// Scheduling
const showSchedule = ref(false);
const scheduleAt = ref('');

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

function quoteBody(text: string, header: string): string {
  const quoted = (text || '').split('\n').map(line => `> ${line}`).join('\n');
  return `\n\n${header}\n${quoted}`;
}

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

  // Contact suggestions for recipient fields
  api.getContacts()
    .then(result => { contacts.value = result.contacts; })
    .catch(() => { /* suggestions are optional */ });

  // Edit an existing draft / scheduled email
  if (route.query.draft) {
    try {
      const draft = await api.getEmail(route.query.draft as string);
      draftId.value = draft.id;
      from.value = draft.from_address || from.value;
      to.value = draft.to_address || '';
      cc.value = draft.cc || '';
      bcc.value = draft.bcc || '';
      subject.value = draft.subject || '';
      body.value = draft.body_text || '';
      showCc.value = !!draft.cc;
      showBcc.value = !!draft.bcc;
      if (draft.delivery_status === 'failed') {
        notice.value = 'The previous send attempt failed — review and try again.';
      }
    } catch {
      error.value = 'Could not load draft';
    }
    return;
  }

  // Reply with quote
  if (route.query.replyTo) {
    try {
      const original = await api.getEmail(route.query.replyTo as string);
      replyToEmailId.value = original.id;
      to.value = original.from_address;
      subject.value = original.subject?.startsWith('Re:') ? original.subject : `Re: ${original.subject || ''}`;
      const when = new Date(original.created_at.includes('T') ? original.created_at : `${original.created_at.replace(' ', 'T')}Z`).toLocaleString();
      body.value = quoteBody(original.body_text || '', `On ${when}, ${original.from_address} wrote:`);
    } catch {
      // Fall back to legacy query params
      if (route.query.to) to.value = route.query.to as string;
      if (route.query.subject) subject.value = route.query.subject as string;
    }
    return;
  }

  // Forward
  if (route.query.forward) {
    try {
      const original = await api.getEmail(route.query.forward as string);
      forwardOfEmailId.value = original.id;
      subject.value = original.subject?.startsWith('Fwd:') ? original.subject : `Fwd: ${original.subject || ''}`;
      const when = new Date(original.created_at.includes('T') ? original.created_at : `${original.created_at.replace(' ', 'T')}Z`).toLocaleString();
      body.value = quoteBody(
        original.body_text || '',
        `---------- Forwarded message ----------\nFrom: ${original.from_address}\nDate: ${when}\nSubject: ${original.subject || ''}\nTo: ${original.to_address}\n`
      );
      if (original.attachments && original.attachments.length > 0) {
        notice.value = `${original.attachments.length} attachment(s) from the original message will be included.`;
      }
    } catch {
      error.value = 'Could not load message to forward';
    }
    return;
  }

  // Legacy prefill
  if (route.query.to) to.value = route.query.to as string;
  if (route.query.subject) subject.value = route.query.subject as string;
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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

  let scheduleIso: string | undefined;
  if (showSchedule.value && scheduleAt.value) {
    const when = new Date(scheduleAt.value);
    if (isNaN(when.getTime()) || when.getTime() < Date.now() + 60 * 1000) {
      error.value = 'Schedule time must be at least a minute in the future';
      return;
    }
    scheduleIso = when.toISOString();
  }

  isSending.value = true;

  try {
    // Prepare attachments for API
    const attachmentData = attachments.value.map(att => ({
      filename: att.name,
      content: att.content,
      contentType: att.type || 'application/octet-stream',
    }));

    const result = await emailsStore.sendEmail({
      from: from.value,
      to: to.value,
      cc: cc.value || undefined,
      bcc: bcc.value || undefined,
      subject: subject.value,
      text: body.value,
      // Escape before converting newlines so typed markup stays literal text
      html: `<p dir="${textDirection(body.value)}" style="text-align: start; font-family: Vazirmatn, Tahoma, Arial, sans-serif; line-height: 1.9;">${escapeHtml(body.value).replace(/\n/g, '<br>')}</p>`,
      attachments: attachmentData.length > 0 ? attachmentData : undefined,
      draftId: draftId.value || undefined,
      scheduleAt: scheduleIso,
      replyToEmailId: replyToEmailId.value || undefined,
      forwardOfEmailId: forwardOfEmailId.value || undefined,
    });

    router.push({ name: result.scheduled ? 'drafts' : 'sent' });
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to send email';
  } finally {
    isSending.value = false;
  }
}

async function saveDraft() {
  error.value = '';

  if (!from.value) {
    error.value = 'A From address is required to save a draft';
    return;
  }

  isSavingDraft.value = true;
  try {
    const result = await api.saveDraft({
      id: draftId.value || undefined,
      from: from.value,
      to: to.value || undefined,
      cc: cc.value || undefined,
      bcc: bcc.value || undefined,
      subject: subject.value || undefined,
      text: body.value || undefined,
      html: body.value ? `<p dir="${textDirection(body.value)}" style="text-align: start; font-family: Vazirmatn, Tahoma, Arial, sans-serif; line-height: 1.9;">${escapeHtml(body.value).replace(/\n/g, '<br>')}</p>` : undefined,
    });
    draftId.value = result.id;
    notice.value = 'Draft saved.';
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to save draft';
  } finally {
    isSavingDraft.value = false;
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
  <div class="p-8 max-w-4xl">
    <h1 class="page-title mb-6">
      {{ replyToEmailId ? 'Reply' : forwardOfEmailId ? 'Forward' : draftId ? 'Edit draft' : 'Compose' }}
    </h1>

    <div class="card">
      <form class="p-6 space-y-4" @submit.prevent="sendEmail">
        <div v-if="notice" class="alert-success">{{ notice }}</div>

        <!-- From -->
        <div>
          <label for="from" class="label">From</label>
          <select
            v-if="addresses.length > 0"
            id="from"
            v-model="from"
            class="input"
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
            class="input"
          />
        </div>

        <!-- Contact suggestions -->
        <datalist id="contact-suggestions">
          <option v-for="contact in contacts" :key="contact.id" :value="contact.email">
            {{ contact.name || contact.email }}
          </option>
        </datalist>

        <!-- To -->
        <div>
          <label for="to" class="label">To</label>
          <div class="flex items-center gap-2">
            <input
              id="to"
              v-model="to"
              type="email"
              required
              placeholder="recipient@example.com"
              list="contact-suggestions"
              class="input flex-1 min-w-0"
            />
            <button type="button" class="recipient-toggle" :aria-expanded="showCc" aria-controls="cc" @click="showCc = !showCc">Cc</button>
            <button type="button" class="recipient-toggle" :aria-expanded="showBcc" aria-controls="bcc" @click="showBcc = !showBcc">Bcc</button>
          </div>
        </div>

        <!-- CC -->
        <div v-if="showCc">
          <label for="cc" class="label">Cc</label>
          <input id="cc" v-model="cc" type="email" placeholder="cc@example.com" list="contact-suggestions" class="input" />
        </div>

        <!-- BCC -->
        <div v-if="showBcc">
          <label for="bcc" class="label">Bcc</label>
          <input id="bcc" v-model="bcc" type="email" placeholder="bcc@example.com" list="contact-suggestions" class="input" />
        </div>

        <!-- Subject -->
        <div>
          <label for="subject" class="label">Subject</label>
          <input
            id="subject"
            v-model="subject"
            :dir="textDirection(subject)"
            type="text"
            required
            placeholder="Email subject"
            class="input"
          />
        </div>

        <!-- Body -->
        <div>
          <label for="body" class="label">Message</label>
          <textarea
            id="body"
            v-model="body"
            :dir="textDirection(body)"
            rows="12"
            required
            placeholder="Write your message here…"
            class="input message-editor resize-y leading-relaxed"
          ></textarea>
        </div>

        <!-- Attachments -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="label mb-0">Attachments</span>
            <span v-if="attachments.length > 0" class="text-xs text-ink-3 tabular-nums">
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
            class="w-full px-4 py-3 border-2 border-dashed border-edge rounded-lg text-ink-3 hover:border-accent hover:text-accent transition-colors flex items-center justify-center text-sm"
            @click="triggerFileInput"
          >
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            Add attachments (max 5MB per file)
          </button>

          <!-- Attachment list -->
          <div v-if="attachments.length > 0" class="mt-3 space-y-2">
            <div
              v-for="(att, index) in attachments"
              :key="att.name"
              class="flex items-center justify-between p-3 bg-surface-2 rounded-lg"
            >
              <div class="flex items-center min-w-0">
                <svg class="w-5 h-5 text-ink-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                <span class="ml-2 text-sm text-ink truncate">{{ att.name }}</span>
                <span class="ml-2 text-xs text-ink-3 flex-shrink-0">({{ formatFileSize(att.size) }})</span>
              </div>
              <button
                type="button"
                class="ml-2 p-1 text-ink-3 hover:text-danger flex-shrink-0 transition-colors"
                title="Remove attachment"
                @click="removeAttachment(index)"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Send later -->
        <div>
          <button
            type="button"
            class="text-sm text-ink-3 hover:text-ink transition-colors flex items-center gap-1.5"
            @click="showSchedule = !showSchedule"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {{ showSchedule ? 'Send now instead' : 'Send later…' }}
          </button>
          <div v-if="showSchedule" class="mt-2">
            <SchedulePicker v-model="scheduleAt" />
            <p class="hint">Delivered automatically at this time (checked every 5 minutes).</p>
          </div>
        </div>

        <!-- Error -->
        <div v-if="error" class="alert-error">{{ error }}</div>

        <!-- Actions -->
        <div class="flex justify-end space-x-3 pt-4">
          <button type="button" class="btn btn-ghost" @click="cancel">Cancel</button>
          <button type="button" class="btn btn-ghost" :disabled="isSavingDraft" @click="saveDraft">
            {{ isSavingDraft ? 'Saving…' : 'Save draft' }}
          </button>
          <button type="submit" :disabled="isSending" class="btn btn-primary">
            <span v-if="isSending" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            {{ isSending ? 'Sending…' : (showSchedule && scheduleAt ? 'Schedule' : 'Send') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
