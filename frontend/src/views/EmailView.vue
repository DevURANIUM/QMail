<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useEmailsStore } from '@/stores/emails';
import api from '@/api/client';
import { displaySender, senderAddress, senderName } from '@/utils/email';

const route = useRoute();
const router = useRouter();
const emailsStore = useEmailsStore();
const showDeleteConfirm = ref(false);
const showDetails = ref(false);
const copied = ref(false);
const operationError = ref('');
const viewMode = ref<'html' | 'text'>('html');
const email = computed(() => emailsStore.currentEmail);
const isSent = computed(() => route.name === 'sent-email');

const safeEmailDocument = computed(() => {
  if (!email.value?.body_html) return '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><base target="_blank"><style>html{color-scheme:light}body{margin:0;padding:24px;background:#fff;color:#172033;font:14px/1.6 Arial,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}a{color:#2563eb}</style></head><body>${email.value.body_html}</body></html>`;
});

onMounted(() => emailsStore.fetchEmail(route.params.id as string));

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
function goBack() { router.push({ name: isSent.value ? 'sent' : 'inbox' }); }
async function toggleStar() { if (email.value) await emailsStore.toggleStar(email.value.id); }
async function toggleRead() {
  if (!email.value) return;
  await (email.value.is_read ? emailsStore.markAsUnread(email.value.id) : emailsStore.markAsRead(email.value.id));
}
async function deleteEmail() {
  if (!email.value) return;
  await emailsStore.deleteEmail(email.value.id);
  goBack();
}
function replyToEmail() {
  if (!email.value) return;
  router.push({ name: 'compose', query: { replyTo: email.value.id, to: senderAddress(email.value), subject: `Re: ${email.value.subject || ''}` } });
}
async function copyAddress() {
  if (!email.value) return;
  await navigator.clipboard.writeText(senderAddress(email.value));
  copied.value = true;
  window.setTimeout(() => { copied.value = false; }, 1500);
}
function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
async function downloadAttachment(id: string, filename: string) {
  if (!email.value) return;
  operationError.value = '';
  try {
    const blob = await api.downloadAttachment(email.value.id, id);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    operationError.value = error instanceof Error ? error.message : 'Failed to download attachment';
  }
}
</script>

<template>
  <div class="min-h-screen p-4 sm:p-6 lg:p-8">
    <div class="mx-auto max-w-6xl">
      <header class="flex flex-wrap items-center justify-between gap-3 mb-5">
        <button @click="goBack" class="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100 hover:text-gray-900">
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m15 19-7-7 7-7" /></svg>
          {{ isSent ? 'Sent' : 'Inbox' }}
        </button>
        <div v-if="email" class="email-actions flex items-center gap-1 p-1 border rounded-xl shadow-sm">
          <button v-if="!isSent" @click="replyToEmail" class="action-button primary-action" title="Reply">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6 6-6" /></svg><span>Reply</span>
          </button>
          <button v-if="!isSent" @click="toggleStar" class="icon-button" :class="email.is_starred ? 'text-yellow-500' : ''" title="Star">
            <svg class="w-5 h-5" :fill="email.is_starred ? 'currentColor' : 'none'" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m12 2.7 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8L12 2.7z" /></svg>
          </button>
          <button v-if="!isSent" @click="toggleRead" class="icon-button" :title="email.is_read ? 'Mark unread' : 'Mark read'">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.9 5.3a2 2 0 002.2 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          </button>
          <button @click="showDeleteConfirm = true" class="icon-button hover:text-red-500" title="Delete">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.9 12.1A2 2 0 0116.1 21H7.9a2 2 0 01-2-1.9L5 7m5 4v6m4-6v6M4 7h16" /></svg>
          </button>
        </div>
      </header>

      <div v-if="operationError" class="mb-4 p-3 text-sm text-red-200 bg-red-950/60 border border-red-800 rounded-xl">{{ operationError }}</div>
      <div v-if="emailsStore.isLoading" class="flex justify-center py-24"><div class="spinner"></div></div>
      <article v-else-if="email" class="qm-card overflow-hidden email-card">
        <div class="p-5 sm:p-7 border-b border-gray-200">
          <div class="flex flex-col gap-5">
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0">
                <span class="inline-flex px-2 py-1 mb-2 text-xs font-semibold text-primary-700 bg-primary-50 rounded-md">{{ isSent ? 'Sent message' : (email.is_read ? 'Message' : 'New message') }}</span>
                <h1 class="text-xl sm:text-2xl font-bold leading-tight text-gray-900">{{ email.subject || '(No Subject)' }}</h1>
              </div>
              <time class="hidden text-sm text-gray-500 sm:block whitespace-nowrap">{{ formatDate(email.created_at) }}</time>
            </div>
            <div class="flex items-center gap-3">
              <div class="flex items-center justify-center flex-shrink-0 w-11 h-11 text-base font-bold rounded-full sender-avatar">{{ senderName(email).charAt(0).toUpperCase() }}</div>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-x-2">
                  <p class="font-semibold text-gray-900 truncate">{{ isSent ? email.to_address : senderName(email) }}</p>
                  <button v-if="!isSent" @click="copyAddress" class="text-xs text-gray-500 hover:text-primary-600 truncate" title="Copy address">&lt;{{ senderAddress(email) }}&gt; · {{ copied ? 'Copied!' : 'Copy' }}</button>
                </div>
                <button @click="showDetails = !showDetails" class="inline-flex items-center text-xs text-gray-500 hover:text-gray-900">to {{ email.to_address }} <span class="ml-1">{{ showDetails ? '▴' : '▾' }}</span></button>
              </div>
              <time class="text-xs text-gray-500 sm:hidden">{{ formatDate(email.created_at) }}</time>
            </div>
            <div v-if="showDetails" class="grid gap-2 p-4 text-sm border border-gray-200 rounded-xl details-panel sm:grid-cols-[90px_1fr]">
              <span class="text-gray-500">From</span><span class="text-gray-700 break-all">{{ displaySender(email) }}</span>
              <span class="text-gray-500">To</span><span class="text-gray-700 break-all">{{ email.to_address }}</span>
              <template v-if="email.cc"><span class="text-gray-500">CC</span><span class="text-gray-700 break-all">{{ email.cc }}</span></template>
              <span class="text-gray-500">Date</span><span class="text-gray-700">{{ formatDate(email.created_at) }}</span>
            </div>
          </div>
        </div>

        <div class="p-4 sm:p-6 message-area">
          <div v-if="email.body_html && email.body_text" class="flex justify-end mb-3">
            <div class="inline-flex p-1 bg-gray-100 rounded-lg">
              <button v-for="mode in (['html', 'text'] as const)" :key="mode" @click="viewMode = mode" class="px-3 py-1 text-xs font-medium rounded-md capitalize" :class="viewMode === mode ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500'">{{ mode }}</button>
            </div>
          </div>
          <div v-if="email.body_html && viewMode === 'html'" class="overflow-hidden bg-white border border-gray-200 email-preview rounded-xl">
            <iframe :srcdoc="safeEmailDocument" sandbox="allow-popups allow-popups-to-escape-sandbox" title="Email content" class="w-full bg-white border-0 email-frame"></iframe>
          </div>
          <pre v-else-if="email.body_text" class="p-5 overflow-auto font-sans text-sm leading-7 text-gray-700 whitespace-pre-wrap border border-gray-200 text-preview rounded-xl">{{ email.body_text }}</pre>
          <p v-else class="py-16 text-center text-gray-500">This email has no content.</p>
        </div>

        <div v-if="email.attachments?.length" class="px-5 pb-6 sm:px-7">
          <h2 class="mb-3 text-sm font-semibold text-gray-900">Attachments <span class="text-gray-500">({{ email.attachments.length }})</span></h2>
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <button v-for="attachment in email.attachments" :key="attachment.id" @click="downloadAttachment(attachment.id, attachment.filename)" class="flex items-center p-3 text-left border border-gray-200 rounded-xl hover:border-primary-300 hover:bg-primary-50">
              <div class="flex items-center justify-center w-10 h-10 mr-3 rounded-lg bg-primary-100 text-primary-700"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m15.2 7-6.6 6.6a2 2 0 102.8 2.8l6.4-6.6a4 4 0 00-5.6-5.6l-6.4 6.6a6 6 0 108.4 8.4L20.5 13" /></svg></div>
              <div class="min-w-0"><p class="text-sm font-medium text-gray-900 truncate">{{ attachment.filename }}</p><p class="text-xs text-gray-500">{{ formatFileSize(attachment.size) }}</p></div>
            </button>
          </div>
        </div>
      </article>
      <div v-else class="py-20 text-center text-gray-500">Email not found</div>
    </div>

    <div v-if="showDeleteConfirm" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" @click.self="showDeleteConfirm = false">
      <div class="qm-card w-full max-w-sm p-6 shadow-2xl">
        <div class="flex items-center justify-center w-11 h-11 mb-4 text-red-600 bg-red-100 rounded-full"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7 18 20H6L5 7m5 4v5m4-5v5M4 7h16" /></svg></div>
        <h3 class="text-lg font-bold text-gray-900">Delete this email?</h3>
        <p class="mt-2 text-sm text-gray-500">This action cannot be undone.</p>
        <div class="flex justify-end gap-2 mt-6"><button @click="showDeleteConfirm = false" class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg">Cancel</button><button @click="deleteEmail" class="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">Delete</button></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.action-button { @apply inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg; }
.primary-action { @apply text-white bg-primary-600 hover:bg-primary-700; }
.icon-button { @apply p-2 text-gray-500 rounded-lg hover:bg-gray-100 hover:text-gray-900; }
.sender-avatar { background:#dbeafe; color:#1d4ed8; }
.details-panel, .text-preview { background:#f8fafc; }
.message-area { background:#f8fafc; }
.email-frame { min-height: 62vh; }
@media (max-width:640px) { .email-frame { min-height:68vh; } }
</style>
