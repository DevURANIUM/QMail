<script setup lang="ts">
import { computed } from 'vue';
import type { Email } from '@/api/types';
import { avatarColor, avatarInitials } from '@/utils/avatar';

const props = withDefaults(defineProps<{
  emails: Email[];
  variant?: 'inbox' | 'sent';
  compact?: boolean;
  grouped?: boolean;
  /** In the Archive view the archive action means "put back" */
  archiveAction?: 'archive' | 'unarchive';
}>(), {
  variant: 'inbox',
  compact: false,
  grouped: false,
  archiveAction: 'archive',
});

const emit = defineEmits<{
  open: [id: string];
  toggleStar: [id: string];
  toggleRead: [id: string];
  archive: [id: string];
  delete: [id: string];
}>();

const DELIVERY_BADGES: Record<string, { label: string; cls: string }> = {
  delivered: { label: 'Delivered', cls: 'bg-success-soft text-success' },
  opened: { label: 'Opened', cls: 'bg-success-soft text-success' },
  bounced: { label: 'Bounced', cls: 'bg-danger-soft text-danger' },
  failed: { label: 'Failed', cls: 'bg-danger-soft text-danger' },
  deferred: { label: 'Deferred', cls: 'bg-warning-soft text-warning' },
};

function parseDate(dateStr: string): Date {
  return new Date(dateStr.includes('T') ? dateStr : `${dateStr.replace(' ', 'T')}Z`);
}

function formatDate(dateStr: string): string {
  const date = parseDate(dateStr);
  const now = new Date();
  const days = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (days === 1) {
    return 'Yesterday';
  } else if (days < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function counterpart(email: Email): string {
  return props.variant === 'sent' ? email.to_address : email.from_address;
}

/** "billing@stripe.com" → "billing @ stripe.com" split for display emphasis */
function displayName(email: Email): string {
  const address = counterpart(email);
  const local = address.split('@')[0];
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
}

function emailLabels(email: Email): string[] {
  try {
    const parsed = JSON.parse(email.labels || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, 2) : [];
  } catch {
    return [];
  }
}

interface Group { title: string; emails: Email[] }

const groups = computed<Group[]>(() => {
  if (!props.grouped) {
    return [{ title: '', emails: props.emails }];
  }

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const buckets: Group[] = [
    { title: 'Today', emails: [] },
    { title: 'Yesterday', emails: [] },
    { title: 'This week', emails: [] },
    { title: 'Earlier', emails: [] },
  ];

  for (const email of props.emails) {
    const t = parseDate(email.created_at).getTime();
    if (t >= startOfDay) buckets[0].emails.push(email);
    else if (t >= startOfDay - 86400000) buckets[1].emails.push(email);
    else if (t >= startOfDay - 6 * 86400000) buckets[2].emails.push(email);
    else buckets[3].emails.push(email);
  }

  return buckets.filter(b => b.emails.length > 0);
});
</script>

<template>
  <div>
    <template v-for="group in groups" :key="group.title">
      <p
        v-if="group.title"
        class="px-4 pt-4 pb-1.5 text-xs font-medium uppercase tracking-wider text-ink-3"
      >
        {{ group.title }}
      </p>

      <ul class="divide-y divide-edge">
        <li
          v-for="email in group.emails"
          :key="email.id"
          class="group relative hover:bg-surface-2 cursor-pointer transition-colors"
          @click="emit('open', email.id)"
        >
          <!-- Unread accent bar -->
          <span
            v-if="variant === 'inbox' && !email.is_read"
            class="absolute left-0 top-0 bottom-0 w-0.5 bg-accent"
          ></span>

          <div class="px-4 flex items-center gap-3" :class="compact ? 'py-2.5' : 'py-3'">
            <!-- Avatar -->
            <span
              class="flex-shrink-0 rounded-full flex items-center justify-center text-white font-medium select-none"
              :class="compact ? 'w-8 h-8 text-[11px]' : 'w-10 h-10 text-xs'"
              :style="{ background: avatarColor(counterpart(email)) }"
            >
              {{ avatarInitials(counterpart(email)) }}
            </span>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline justify-between gap-2">
                <p class="text-sm truncate" :class="variant === 'inbox' && !email.is_read ? 'font-semibold text-ink' : 'font-medium text-ink-2'">
                  {{ displayName(email) }}
                  <span class="font-normal text-ink-3 text-xs font-mono ml-1 hidden sm:inline">{{ counterpart(email) }}</span>
                </p>
                <span class="flex items-center gap-2 flex-shrink-0">
                  <span
                    v-if="variant === 'sent' && email.delivery_status && DELIVERY_BADGES[email.delivery_status]"
                    class="badge"
                    :class="DELIVERY_BADGES[email.delivery_status].cls"
                  >
                    {{ DELIVERY_BADGES[email.delivery_status].label }}
                  </span>
                  <!-- Starred indicator -->
                  <svg
                    v-if="variant === 'inbox' && email.is_starred"
                    class="w-3.5 h-3.5 text-warning"
                    fill="currentColor" viewBox="0 0 24 24"
                  >
                    <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                  <!-- Attachment indicator -->
                  <svg
                    v-if="(email.attachment_count ?? 0) > 0"
                    class="w-3.5 h-3.5 text-ink-3"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  <span
                    class="text-xs text-ink-3 tabular-nums transition-opacity"
                    :class="compact ? '' : 'md:group-hover:opacity-0'"
                  >
                    {{ formatDate(email.created_at) }}
                  </span>
                </span>
              </div>

              <p dir="auto" class="text-sm truncate mt-0.5 text-start">
                <span :class="variant === 'inbox' && !email.is_read ? 'font-medium text-ink' : 'text-ink-2'">
                  {{ email.subject || '(No Subject)' }}
                </span>
                <span v-if="!compact && email.body_text" class="text-ink-3"> — {{ email.body_text.substring(0, 110) }}</span>
              </p>

              <!-- Labels -->
              <div v-if="!compact && emailLabels(email).length > 0" class="flex gap-1.5 mt-1">
                <span v-for="label in emailLabels(email)" :key="label" class="badge bg-accent-soft text-accent !text-[10px] !py-0">
                  {{ label }}
                </span>
              </div>
            </div>
          </div>

          <!-- Hover quick actions -->
          <div
            v-if="!compact"
            class="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-surface-2 rounded-lg pl-1"
            @click.stop
          >
            <button
              v-if="variant === 'inbox'"
              class="btn-icon !p-1.5"
              :class="email.is_starred ? 'text-warning hover:text-warning' : ''"
              :title="email.is_starred ? 'Remove star' : 'Add star'"
              @click="emit('toggleStar', email.id)"
            >
              <svg class="h-4 w-4" :fill="email.is_starred ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </button>
            <button
              v-if="variant === 'inbox'"
              class="btn-icon !p-1.5"
              :title="email.is_read ? 'Mark as unread' : 'Mark as read'"
              @click="emit('toggleRead', email.id)"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              v-if="variant === 'inbox'"
              class="btn-icon !p-1.5"
              :title="archiveAction === 'unarchive' ? 'Move back to inbox' : 'Archive'"
              @click="emit('archive', email.id)"
            >
              <svg v-if="archiveAction === 'archive'" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              <svg v-else class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            </button>
            <button
              class="btn-icon !p-1.5 hover:text-danger"
              title="Delete"
              @click="emit('delete', email.id)"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </li>
      </ul>
    </template>
  </div>
</template>
