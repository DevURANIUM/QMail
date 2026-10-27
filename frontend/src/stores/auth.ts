import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import api from '@/api/client';

export const useAuthStore = defineStore('auth', () => {
  const isAuthenticated = ref(false);
  const needsSetup = ref(false);
  const hasPasskeys = ref(false);
  const isLoading = ref(true);

  const isReady = computed(() => !isLoading.value);

  async function checkAuth() {
    isLoading.value = true;
    try {
      const status = await api.checkAuthStatus();
      isAuthenticated.value = status.authenticated;
      needsSetup.value = status.needsSetup;
      hasPasskeys.value = status.hasPasskeys;
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

  /**
   * Sign in with a registered passkey (FIDO2/WebAuthn)
   */
  async function loginWithPasskey() {
    const options = await api.webauthnLoginOptions();
    const assertion = await startAuthentication({ optionsJSON: options });
    const response = await api.webauthnLoginVerify(assertion);
    if (response.success) {
      isAuthenticated.value = true;
      needsSetup.value = false;
    }
    return response;
  }

  /**
   * Register a new passkey for the current session
   */
  async function registerPasskey(deviceName?: string) {
    const options = await api.webauthnRegisterOptions();
    const attestation = await startRegistration({ optionsJSON: options });
    const result = await api.webauthnRegisterVerify(attestation, deviceName);
    if (result.success) {
      hasPasskeys.value = true;
    }
    return result;
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
    hasPasskeys,
    isLoading,
    isReady,
    checkAuth,
    login,
    loginWithPasskey,
    registerPasskey,
    setup,
    logout,
  };
});
