<script setup lang="ts">
import { onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';

const authStore = useAuthStore();
// Instantiating the theme store applies the saved preference immediately
useThemeStore();

onMounted(() => {
  authStore.checkAuth();
});
</script>

<template>
  <div v-if="authStore.isLoading" class="min-h-screen flex items-center justify-center bg-page">
    <div class="spinner"></div>
  </div>
  <router-view v-else />
</template>
