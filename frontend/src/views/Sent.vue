<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useEmailsStore } from '@/stores/emails';
const router = useRouter(); const store = useEmailsStore(); const search = ref('');
onMounted(()=>store.fetchEmails('sent'));
const emails = computed(()=>{const q=search.value.toLowerCase().trim();return store.sent.filter(e=>!q||[e.to_address,e.subject,e.body_text].some(v=>v?.toLowerCase().includes(q)))});
function date(v:string){const d=new Date(v),days=Math.floor((Date.now()-d.getTime())/86400000);return days===0?d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):days===1?'Yesterday':d.toLocaleDateString([],{month:'short',day:'numeric'})}
</script>
<template><div class="qm-page"><div class="qm-container">
  <div class="flex flex-wrap items-end justify-between gap-4 mb-6"><div><p class="text-xs font-bold tracking-[.2em] uppercase text-primary-600">Outbox</p><h1 class="qm-title mt-1">Sent messages</h1><p class="qm-subtitle">{{ store.sent.length }} messages delivered from QMail</p></div><div class="flex gap-2"><button @click="store.fetchEmails('sent')" class="qm-button">Refresh</button><router-link :to="{name:'compose'}" class="qm-button-primary">New message</router-link></div></div>
  <label class="sent-search mb-4">
    <svg aria-hidden="true" class="sent-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-width="2" d="m21 21-4.5-4.5m2.5-5.5a8 8 0 11-16 0 8 8 0 0116 0z"/></svg>
    <input v-model="search" type="search" class="qm-input sent-search-input" aria-label="Search sent messages" placeholder="Search sent messages…">
  </label>
  <div v-if="store.isLoading" class="flex justify-center py-24"><div class="spinner"></div></div>
  <div v-else-if="!emails.length" class="qm-card py-20 text-center"><div class="empty-icon">↗</div><h2 class="mt-4 font-bold text-gray-900">No sent messages</h2><p class="mt-1 text-sm text-gray-500">Messages you send will appear here.</p></div>
  <div v-else class="qm-card overflow-hidden"><ul class="divide-y divide-gray-200"><li v-for="email in emails" :key="email.id" @click="router.push({name:'sent-email',params:{id:email.id}})" class="sent-row"><div class="sent-avatar">{{ email.to_address.charAt(0).toUpperCase() }}</div><div class="min-w-0 flex-1"><div class="flex justify-between gap-3"><p class="text-sm font-semibold text-gray-900 truncate">To: {{ email.to_address }}</p><time class="text-xs text-gray-400">{{ date(email.created_at) }}</time></div><p class="mt-0.5 text-sm text-gray-700 truncate">{{ email.subject||'(No subject)' }}</p><p class="mt-0.5 text-xs text-gray-500 truncate">{{ email.body_text||'HTML message' }}</p></div></li></ul></div>
</div></div></template>
<style scoped>.sent-search{@apply relative block}.sent-search-icon{@apply absolute z-10 w-5 h-5 text-gray-400 pointer-events-none left-4 top-1/2 -translate-y-1/2}.sent-search-input{padding-left:3rem!important}.sent-row{@apply flex items-center gap-4 px-5 py-4 cursor-pointer transition-colors hover:bg-gray-50}.sent-avatar{@apply flex items-center justify-center flex-shrink-0 w-10 h-10 text-sm font-bold text-indigo-700 bg-indigo-100 rounded-xl}.empty-icon{@apply flex items-center justify-center w-12 h-12 mx-auto text-xl font-bold text-primary-600 bg-primary-100 rounded-2xl}</style>
