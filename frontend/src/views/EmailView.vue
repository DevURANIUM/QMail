<script setup lang="ts">
import { onMounted, computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { textDirection } from '@/utils/textDirection';
import DOMPurify from 'dompurify';
import { useEmailsStore } from '@/stores/emails';
import api from '@/api/client';

const route = useRoute();
const router = useRouter();
const emailsStore = useEmailsStore();
const showDeleteConfirm = ref(false);
const showImages = ref(false);
const blockRemoteImages = ref(true);
const hasBlockedImages = ref(false);
const newLabel = ref('');
const isSavingLabels = ref(false);
const contactSaved = ref(false);

async function addSenderToContacts() {
  if (!email.value) return;
  try {
    await api.saveContact({ email: email.value.from_address });
    contactSaved.value = true;
  } catch {
    // Non-critical
  }
}

const email = computed(() => emailsStore.currentEmail);
const isSent = computed(() => route.name === 'sent-email');

const labels = computed<string[]>(() => {
  try {
    const parsed = JSON.parse(email.value?.labels || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
});

const threadOthers = computed(() =>
  (email.value?.thread || []).filter(t => t.id !== email.value?.id)
);

// Links in emails open in a new tab without a referrer or opener handle
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/**
 * Received email HTML is untrusted input — sanitize before rendering.
 * Remote images are stripped until the user reveals them (tracking-pixel
 * privacy); data: URIs and inline images are always allowed.
 */
const sanitizedHtml = computed(() => {
  if (!email.value?.body_html) return '';

  const blocking = blockRemoteImages.value && !showImages.value && email.value.type === 'received';
  let blocked = false;

  const hook = (node: Element) => {
    if (!blocking) return;
    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src') || '';
      if (src && !/^data:image\//i.test(src) && !/^blob:/i.test(src)) {
        node.removeAttribute('src');
        node.setAttribute('alt', node.getAttribute('alt') || 'Blocked remote image');
        blocked = true;
      }
    }
    // Strip CSS that loads remote resources
    const style = node.getAttribute?.('style');
    if (style && /url\s*\(/i.test(style)) {
      node.removeAttribute('style');
      blocked = true;
    }
  };

  DOMPurify.addHook('afterSanitizeAttributes', hook);
  const clean = DOMPurify.sanitize(email.value.body_html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'textarea', 'select', 'button'],
    FORBID_ATTR: ['autofocus', 'srcset', 'background', 'ping'],
  });
  // Pops the image-blocking hook added above; the module-level link hook stays
  DOMPurify.removeHook('afterSanitizeAttributes');

  hasBlockedImages.value = blocked;
  return clean;
});

async function load() {
  showImages.value = false;
  const id = route.params.id as string;
  await emailsStore.fetchEmail(id);
}

onMounted(async () => {
  try {
    const settings = await api.getSettings();
    blockRemoteImages.value = settings.block_remote_images !== 'false';
  } catch {
    // Default to blocking
  }
  await load();
});

watch(() => route.params.id, load);

function formatDate(dateStr: string): string {
  return new Date(dateStr.includes('T') ? dateStr : `${dateStr.replace(' ', 'T')}Z`).toLocaleString();
}

function goBack() {
  router.push({ name: isSent.value ? 'sent' : 'inbox' });
}

async function toggleStar() {
  if (email.value) {
    await emailsStore.toggleStar(email.value.id);
  }
}

async function toggleRead() {
  if (email.value) {
    if (email.value.is_read) {
      await emailsStore.markAsUnread(email.value.id);
    } else {
      await emailsStore.markAsRead(email.value.id);
    }
  }
}

async function toggleArchive() {
  if (!email.value) return;
  if (email.value.archived) {
    await api.unarchiveEmail(email.value.id);
  } else {
    await api.archiveEmail(email.value.id);
    goBack();
    return;
  }
  await load();
}

async function deleteEmail() {
  if (email.value) {
    await emailsStore.deleteEmail(email.value.id);
    goBack();
  }
}

function replyToEmail() {
  if (email.value) {
    router.push({ name: 'compose', query: { replyTo: email.value.id } });
  }
}

function forwardEmail() {
  if (email.value) {
    router.push({ name: 'compose', query: { forward: email.value.id } });
  }
}

async function downloadEml() {
  if (!email.value) return;
  await api.downloadEml(email.value.id, `${email.value.subject || 'email'}.eml`);
}

async function addLabel() {
  const label = newLabel.value.trim();
  if (!label || !email.value) return;
  isSavingLabels.value = true;
  try {
    await api.setEmailLabels(email.value.id, [...labels.value, label]);
    newLabel.value = '';
    await load();
  } finally {
    isSavingLabels.value = false;
  }
}

async function removeLabel(label: string) {
  if (!email.value) return;
  await api.setEmailLabels(email.value.id, labels.value.filter(l => l !== label));
  await load();
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function downloadAttachment(attachmentId: string, filename: string) {
  if (!email.value) return;
  await api.downloadAttachment(email.value.id, attachmentId, filename);
}

function getFileIcon(contentType: string): string {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.includes('pdf')) return 'pdf';
  return 'file';
}

function openThreadEmail(id: string, type: string) {
  router.push({ name: type === 'sent' ? 'sent-email' : 'email', params: { id } });
}

const deliveryStatusStyle = computed(() => {
  const status = email.value?.delivery_status;
  if (!status) return null;
  const map: Record<string, { label: string; cls: string }> = {
    queued: { label: 'Queued', cls: 'bg-surface-2 text-ink-2' },
    deferred: { label: 'Deferred', cls: 'bg-warning-soft text-warning' },
    delivered: { label: 'Delivered', cls: 'bg-success-soft text-success' },
    opened: { label: 'Opened', cls: 'bg-success-soft text-success' },
    bounced: { label: 'Bounced', cls: 'bg-danger-soft text-danger' },
    failed: { label: 'Failed', cls: 'bg-danger-soft text-danger' },
  };
  return map[status] || null;
});
</script>

<template>
  <div class="p-8 max-w-5xl">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <button class="flex items-center text-sm text-ink-2 hover:text-ink transition-colors" @click="goBack">
        <svg class="w-5 h-5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        Back to {{ isSent ? 'Sent' : 'Inbox' }}
      </button>

      <div v-if="email" class="flex items-center space-x-1.5">
        <button v-if="!isSent" class="btn btn-ghost" @click="replyToEmail">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
          Reply
        </button>

        <button class="btn btn-ghost" @click="forwardEmail">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 10H11a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
          </svg>
          Forward
        </button>

        <button
          v-if="!isSent"
          class="btn-icon"
          :class="email.is_starred ? 'text-warning hover:text-warning' : ''"
          :title="email.is_starred ? 'Remove star' : 'Add star'"
          @click="toggleStar"
        >
          <svg class="h-5 w-5" :fill="email.is_starred ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </button>

        <button
          v-if="!isSent"
          class="btn-icon"
          :title="email.archived ? 'Move back to inbox' : 'Archive'"
          @click="toggleArchive"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
        </button>

        <button
          v-if="!isSent"
          class="btn-icon"
          :title="email.is_read ? 'Mark as unread' : 'Mark as read'"
          @click="toggleRead"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </button>

        <button class="btn-icon" title="Download .eml" @click="downloadEml">
          <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>

        <button class="btn-icon hover:text-danger" title="Delete" @click="showDeleteConfirm = true">
          <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="emailsStore.isLoading" class="flex justify-center py-12">
      <div class="spinner"></div>
    </div>

    <!-- Email content -->
    <template v-else-if="email">
      <!-- Conversation -->
      <div v-if="threadOthers.length > 0" class="card mb-4 overflow-hidden">
        <p class="px-4 pt-3 pb-1 text-xs font-medium uppercase tracking-wide text-ink-3">
          Conversation · {{ threadOthers.length + 1 }} messages
        </p>
        <ul class="divide-y divide-edge">
          <li
            v-for="entry in threadOthers"
            :key="entry.id"
            class="px-4 py-2.5 hover:bg-surface-2 cursor-pointer transition-colors flex items-center justify-between gap-2"
            @click="openThreadEmail(entry.id, entry.type)"
          >
            <div class="min-w-0 flex items-center gap-2">
              <span class="badge flex-shrink-0" :class="entry.type === 'sent' ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-ink-2'">
                {{ entry.type === 'sent' ? 'You' : 'Them' }}
              </span>
              <p dir="auto" class="text-sm text-ink-2 truncate">{{ entry.subject || '(No Subject)' }}</p>
            </div>
            <p class="text-xs text-ink-3 flex-shrink-0">{{ formatDate(entry.created_at) }}</p>
          </li>
        </ul>
      </div>

      <div class="card">
        <!-- Email header -->
        <div class="p-6 border-b border-edge">
          <div class="flex items-start justify-between gap-3 mb-4">
            <h1 :dir="textDirection(email.subject || '')" class="font-display text-xl text-ink flex-1 min-w-0 text-start leading-relaxed">
              {{ email.subject || '(No Subject)' }}
            </h1>
            <span v-if="isSent && deliveryStatusStyle" class="badge flex-shrink-0" :class="deliveryStatusStyle.cls">
              {{ deliveryStatusStyle.label }}
            </span>
          </div>

          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <p class="text-sm font-medium text-ink truncate flex items-center gap-2">
                {{ isSent ? 'To' : 'From' }}: <span class="font-mono text-xs">{{ isSent ? email.to_address : email.from_address }}</span>
                <button
                  v-if="!isSent && !contactSaved"
                  class="text-ink-3 hover:text-accent transition-colors flex-shrink-0"
                  title="Add sender to contacts"
                  @click="addSenderToContacts"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                </button>
                <span v-else-if="!isSent && contactSaved" class="text-xs text-success flex-shrink-0">✓ In contacts</span>
              </p>
              <p v-if="!isSent" class="text-sm text-ink-3 truncate">
                To: <span class="font-mono text-xs">{{ email.to_address }}</span>
              </p>
              <p v-if="email.cc" class="text-sm text-ink-3 truncate">
                CC: <span class="font-mono text-xs">{{ email.cc }}</span>
              </p>
            </div>
            <p class="text-sm text-ink-3 flex-shrink-0">
              {{ formatDate(email.created_at) }}
            </p>
          </div>

          <!-- Labels -->
          <div class="flex flex-wrap items-center gap-2 mt-3">
            <span
              v-for="label in labels"
              :key="label"
              class="badge bg-accent-soft text-accent group"
            >
              {{ label }}
              <button class="ml-1.5 opacity-60 hover:opacity-100" title="Remove label" @click="removeLabel(label)">×</button>
            </span>
            <form class="inline-flex" @submit.prevent="addLabel">
              <input
                v-model="newLabel"
                aria-label="Add label"
                type="text"
                placeholder="+ label"
                maxlength="40"
                class="text-xs bg-transparent border border-dashed border-edge-2 rounded-full px-2.5 py-0.5 w-20 focus:w-32 transition-all focus:outline-none focus:border-accent text-ink placeholder:text-ink-3"
                :disabled="isSavingLabels"
              />
            </form>
          </div>
        </div>

        <!-- Blocked images bar -->
        <div v-if="hasBlockedImages && !showImages" class="px-6 py-2.5 bg-surface-2 border-b border-edge flex items-center justify-between gap-3">
          <p class="text-xs text-ink-2">Remote images are blocked for privacy.</p>
          <button class="text-xs font-medium text-accent hover:text-accent-hover" @click="showImages = true">
            Show images
          </button>
        </div>

        <!-- Email body -->
        <div class="p-6">
          <div
            v-if="sanitizedHtml"
            dir="auto"
            class="email-content"
            :class="{ 'email-authored': isSent }"
            v-html="sanitizedHtml"
          ></div>
          <pre
            v-else-if="email.body_text"
            :dir="textDirection(email.body_text)"
            class="email-plain whitespace-pre-wrap font-sans text-sm text-ink-2 leading-relaxed"
          >{{ email.body_text }}</pre>
          <p v-else class="text-ink-3 italic">No content</p>
        </div>

        <!-- Attachments -->
        <div v-if="email.attachments && email.attachments.length > 0" class="px-6 pb-6">
          <div class="border-t border-edge pt-4">
            <h3 class="text-sm font-medium text-ink mb-3">
              Attachments ({{ email.attachments.length }})
            </h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <button
                v-for="attachment in email.attachments"
                :key="attachment.id"
                class="flex items-center p-3 bg-surface-2 rounded-lg hover:bg-edge transition-colors text-left"
                @click="downloadAttachment(attachment.id, attachment.filename)"
              >
                <div class="flex-shrink-0 w-10 h-10 bg-accent-soft rounded-lg flex items-center justify-center">
                  <svg v-if="getFileIcon(attachment.content_type) === 'image'" class="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <svg v-else-if="getFileIcon(attachment.content_type) === 'pdf'" class="w-5 h-5 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <svg v-else class="w-5 h-5 text-ink-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </div>
                <div class="ml-3 min-w-0 flex-1">
                  <p class="text-sm font-medium text-ink truncate">{{ attachment.filename }}</p>
                  <p class="text-xs text-ink-3">{{ formatFileSize(attachment.size) }}</p>
                </div>
                <svg class="w-5 h-5 text-ink-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Not found -->
    <div v-else class="card text-center py-16">
      <p class="text-ink-3">Email not found</p>
    </div>

    <!-- Delete confirmation modal -->
    <div
      v-if="showDeleteConfirm"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      @click.self="showDeleteConfirm = false"
    >
      <div class="card shadow-pop p-6 max-w-sm w-full mx-4">
        <h3 class="text-lg font-medium text-ink mb-3">Delete email</h3>
        <p class="text-sm text-ink-2 mb-6">
          This permanently removes the message and its attachments.
        </p>
        <div class="flex justify-end space-x-3">
          <button class="btn btn-ghost" @click="showDeleteConfirm = false">Cancel</button>
          <button class="btn btn-danger" @click="deleteEmail">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>
