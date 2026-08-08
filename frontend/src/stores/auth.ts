import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/api/client';

export const useAuthStore = defineStore('auth', () => {
  const isAuthenticated = ref(false);
  const needsSetup = ref(false);
  const isLoading = ref(true);

  const isReady = computed(() => !isLoading.value);

  async function checkAuth() {
    isLoading.value = true;
    try {
      const status = await api.checkAuthStatus();
      isAuthenticated.value = status.authenticated;
      needsSetup.value = status.needsSetup;
    } catch {
      isAuthenticated.value = false;
      needsSetup.value = false;
    } finally {
      isLoading.value = false;
    }
  }

  async function login(password: string) {
    const response = await api.login(password);
    if (response.success) {
      isAuthenticated.value = true;
      needsSetup.value = false;
    }
    return response;
  }

  async function setup(password: string) {
    const response = await api.setup(password);
    if (response.success) {
      isAuthenticated.value = true;
      needsSetup.value = false;
    }
    return response;
  }

  async function logout() {
    try {
      await api.logout();
    } finally {
      isAuthenticated.value = false;
      api.setToken(null);
    }
  }

  return {
    isAuthenticated,
    needsSetup,
    isLoading,
    isReady,
    checkAuth,
    login,
    setup,
    logout,
  };
});
