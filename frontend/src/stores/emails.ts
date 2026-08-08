import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/api/client';
import type { Email, EmailStats } from '@/api/types';

export const useEmailsStore = defineStore('emails', () => {
  const emails = ref<Email[]>([]);
  const currentEmail = ref<Email | null>(null);
  const stats = ref<EmailStats>({
    total_received: 0,
    total_sent: 0,
    unread: 0,
    starred: 0,
  });
  const isLoading = ref(false);
  const currentView = ref<'inbox' | 'sent' | 'starred'>('inbox');

  const inbox = computed(() => emails.value.filter(e => e.type === 'received'));
  const sent = computed(() => emails.value.filter(e => e.type === 'sent'));
  const starred = computed(() => emails.value.filter(e => e.is_starred === 1));

  async function fetchEmails(type?: 'received' | 'sent') {
    isLoading.value = true;
    try {
      const response = await api.getEmails({ type, limit: 100 });
      emails.value = response.emails;
    } finally {
      isLoading.value = false;
    }
  }

  async function fetchStats() {
    try {
      stats.value = await api.getEmailStats();
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }

  async function fetchEmail(id: string) {
    isLoading.value = true;
    try {
      currentEmail.value = await api.getEmail(id);
      // Update the email in the list to mark as read
      const index = emails.value.findIndex(e => e.id === id);
      if (index !== -1) {
        emails.value[index].is_read = 1;
      }
      await fetchStats();
    } finally {
      isLoading.value = false;
    }
  }

  async function sendEmail(data: {
    from: string;
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    text?: string;
    html?: string;
    attachments?: Array<{
      filename: string;
      content: string;
      contentType?: string;
    }>;
  }) {
    const response = await api.sendEmail(data);
    await fetchEmails('sent');
    await fetchStats();
    return response;
  }

  async function markAsRead(id: string) {
    await api.markAsRead(id);
    const email = emails.value.find(e => e.id === id);
    if (email) email.is_read = 1;
    if (currentEmail.value?.id === id) currentEmail.value.is_read = 1;
    await fetchStats();
  }

  async function markAsUnread(id: string) {
    await api.markAsUnread(id);
    const email = emails.value.find(e => e.id === id);
    if (email) email.is_read = 0;
    if (currentEmail.value?.id === id) currentEmail.value.is_read = 0;
    await fetchStats();
  }

  async function toggleStar(id: string) {
    await api.toggleStar(id);
    const email = emails.value.find(e => e.id === id);
    if (email) email.is_starred = email.is_starred === 1 ? 0 : 1;
    if (currentEmail.value?.id === id) {
      currentEmail.value.is_starred = currentEmail.value.is_starred === 1 ? 0 : 1;
    }
    await fetchStats();
  }

  async function deleteEmail(id: string) {
    await api.deleteEmail(id);
    emails.value = emails.value.filter(e => e.id !== id);
    if (currentEmail.value?.id === id) currentEmail.value = null;
    await fetchStats();
  }

  async function bulkAction(ids: string[], action: 'read' | 'unread' | 'delete') {
    await api.bulkEmailAction(ids, action);
    const selected = new Set(ids);
    if (action === 'delete') {
      emails.value = emails.value.filter(email => !selected.has(email.id));
    } else {
      const readValue = action === 'read' ? 1 : 0;
      emails.value.forEach(email => {
        if (selected.has(email.id)) email.is_read = readValue;
      });
    }
    await fetchStats();
  }

  async function markAllRead() {
    await api.markAllEmailsRead();
    emails.value.forEach(email => {
      if (email.type === 'received') email.is_read = 1;
    });
    await fetchStats();
  }

  function setView(view: 'inbox' | 'sent' | 'starred') {
    currentView.value = view;
  }

  function clearCurrentEmail() {
    currentEmail.value = null;
  }

  return {
    emails,
    currentEmail,
    stats,
    isLoading,
    currentView,
    inbox,
    sent,
    starred,
    fetchEmails,
    fetchStats,
    fetchEmail,
    sendEmail,
    markAsRead,
    markAsUnread,
    toggleStar,
    deleteEmail,
    bulkAction,
    markAllRead,
    setView,
    clearCurrentEmail,
  };
});
