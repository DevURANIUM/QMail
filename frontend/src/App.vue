<script setup lang="ts">
import { onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();

onMounted(() => {
  authStore.checkAuth();
});
</script>

<template>
  <div v-if="authStore.isLoading" class="min-h-screen flex items-center justify-center">
    <div class="spinner"></div>
  </div>
  <router-view v-else />
</template>
