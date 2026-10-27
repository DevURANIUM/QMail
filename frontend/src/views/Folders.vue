<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import api from '@/api/client';
import type { Email } from '@/api/types';
const router = useRouter();
const folders = ref<{ id: string; name: string; count: number }[]>([]);
const current = ref('');
const mailbox = ref<'received' | 'sent'>('received');
const name = ref('');
const rename = ref('');
const destination = ref('');
const emails = ref<Email[]>([]);
const selected = ref<string[]>([]);
const offset = ref(0);
const busy = ref(false);
const error = ref('');
const success = ref('');
const currentFolder = computed(() => folders.value.find(f => f.id === current.value));
const allSelected = computed(() => emails.value.length > 0 && selected.value.length === emails.value.length);
async function loadMail() {
  selected.value = [];
  const result = await api.getEmails({ type: current.value ? undefined : mailbox.value, folder: current.value || undefined, limit: 50, offset: offset.value });
  emails.value = result.emails;
  rename.value = currentFolder.value?.name || '';
}
async function refresh() { folders.value = (await api.getFolders()).folders; await loadMail(); }
async function run(action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true; error.value = ''; success.value = '';
  try { await action(); } catch (e) { error.value = e instanceof Error ? e.message : 'Could not update folders.'; }
  finally { busy.value = false; }
}
onMounted(() => run(refresh));
function choose() { offset.value = 0; run(loadMail); }
function toggleAll() { selected.value = allSelected.value ? [] : emails.value.map(e => e.id); }
async function create() { await run(async () => { const folder = await api.createFolder(name.value); name.value = ''; current.value = folder.id; offset.value = 0; await refresh(); success.value = 'Folder created.'; }); }
async function saveName() { await run(async () => { await api.renameFolder(current.value, rename.value); await refresh(); success.value = 'Folder renamed.'; }); }
async function remove() {
  if (!confirm('Delete this folder? Emails will return to their original mailbox, not be deleted.')) return;
  await run(async () => { await api.deleteFolder(current.value); current.value = ''; offset.value = 0; await refresh(); success.value = 'Folder deleted. Emails preserved.'; });
}
async function move() { await run(async () => { await api.moveEmails(selected.value, destination.value || null); await refresh(); success.value = 'Selected emails moved.'; }); }
function page(delta: number) { offset.value = Math.max(0, offset.value + delta); run(loadMail); }
</script>
<template>
  <div class="p-8 max-w-6xl">
    <h1 class="page-title">Folders</h1><p class="mt-2 mb-6 text-sm text-ink-2">A place for everything. Organize messages without losing their labels.</p>
    <p v-if="error" role="alert" class="alert-error mb-4">{{ error }}</p>
    <p v-if="success" role="status" class="alert-success mb-4">{{ success }}</p>
    <form class="card p-4 mb-4 flex flex-wrap items-end gap-3" @submit.prevent="create">
      <div class="flex-1 min-w-0"><label for="new-folder" class="label">New folder</label><input id="new-folder" v-model="name" class="input" maxlength="60" required placeholder="Work, receipts, personal…" /></div>
      <button class="btn btn-primary" :disabled="busy || !name.trim()">Create folder</button>
    </form>
    <div class="card p-4 mb-4 space-y-4">
      <div><label for="current-folder" class="label">Mailbox or folder</label><select id="current-folder" v-model="current" class="input" :disabled="busy" @change="choose"><option value="">Original mailbox</option><option v-for="f in folders" :key="f.id" :value="f.id">{{ f.name }} ({{ f.count }})</option></select></div>
      <div v-if="!current"><label for="source-mailbox" class="label">Source mailbox</label><select id="source-mailbox" v-model="mailbox" class="input" :disabled="busy" @change="choose"><option value="received">Inbox</option><option value="sent">Sent</option></select></div>
      <form v-if="current" class="flex flex-wrap items-end gap-3" @submit.prevent="saveName"><div class="flex-1"><label for="rename-folder" class="label">Folder name</label><input id="rename-folder" v-model="rename" class="input" required maxlength="60" /></div><button class="btn btn-ghost" :disabled="busy">Rename</button><button type="button" class="btn btn-ghost text-danger" :disabled="busy" @click="remove">Delete folder</button></form>
    </div>
    <div class="card overflow-hidden" :aria-busy="busy">
      <div class="p-4 border-b border-edge flex flex-wrap items-center gap-3">
        <label class="text-sm flex items-center gap-2"><input type="checkbox" :checked="allSelected" :disabled="busy || !emails.length" @change="toggleAll" /> Select page</label><span class="text-sm text-ink-2">{{ selected.length }} selected</span>
        <label for="move-folder" class="sr-only">Move selected emails to</label><select id="move-folder" v-model="destination" class="input !w-auto max-w-full" :disabled="busy"><option value="">Original mailbox</option><option v-for="f in folders" :key="f.id" :value="f.id">{{ f.name }}</option></select>
        <button class="btn btn-primary" :disabled="busy || !selected.length || destination === current" @click="move">Move selected</button>
      </div>
      <p v-if="!emails.length" class="p-8 text-center text-sm text-ink-2">{{ busy ? 'Loading messages…' : 'No messages here yet. Move some from Inbox.' }}</p>
      <ul class="divide-y divide-edge"><li v-for="email in emails" :key="email.id" class="flex items-center gap-3 px-4 py-3 hover:bg-surface-2"><input v-model="selected" type="checkbox" :value="email.id" :aria-label="`Select ${email.subject || 'untitled email'}`" :disabled="busy" /><button class="text-left flex-1 min-w-0 rounded-md" @click="router.push({ name: email.type === 'sent' ? 'sent-email' : 'email', params: { id: email.id } })"><span class="block text-xs text-ink-2 truncate">{{ email.from_address }}</span><span class="block text-sm truncate" :class="!email.is_read ? 'font-semibold' : ''">{{ email.subject || '(No subject)' }}</span></button></li></ul>
      <div class="flex items-center justify-between p-4 border-t border-edge"><button class="btn btn-ghost" :disabled="busy || offset === 0" @click="page(-50)">Previous</button><span class="text-xs text-ink-2">Page {{ offset / 50 + 1 }}</span><button class="btn btn-ghost" :disabled="busy || emails.length < 50" @click="page(50)">Next</button></div>
    </div>
  </div>
</template>
