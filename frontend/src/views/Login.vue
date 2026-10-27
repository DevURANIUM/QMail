<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const authStore = useAuthStore();

const password = ref('');
const confirmPassword = ref('');
const error = ref('');
const isLoading = ref(false);
const isPasskeyLoading = ref(false);

const isSetupMode = computed(() => authStore.needsSetup);
const showPasskey = computed(() => !isSetupMode.value && authStore.hasPasskeys);

async function handleSubmit() {
  error.value = '';

  if (!password.value) {
    error.value = 'Password is required';
    return;
  }

  if (isSetupMode.value) {
    if (password.value.length < 8) {
      error.value = 'Password must be at least 8 characters';
      return;
    }
    if (password.value !== confirmPassword.value) {
      error.value = 'Passwords do not match';
      return;
    }
  }

  isLoading.value = true;

  try {
    if (isSetupMode.value) {
      await authStore.setup(password.value);
      router.push({ name: 'setup' });
    } else {
      await authStore.login(password.value);
      router.push({ name: 'dashboard' });
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Authentication failed';
  } finally {
    isLoading.value = false;
  }
}

async function handlePasskeyLogin() {
  error.value = '';
  isPasskeyLoading.value = true;

  try {
    await authStore.loginWithPasskey();
    router.push({ name: 'dashboard' });
  } catch (e) {
    // A cancelled browser prompt is not an error worth showing
    if (e instanceof Error && e.name !== 'NotAllowedError') {
      error.value = e.message || 'Passkey sign-in failed';
    }
  } finally {
    isPasskeyLoading.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-page py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full">
      <div class="text-center">
        <div class="mx-auto h-14 w-14 bg-accent rounded-2xl flex items-center justify-center">
          <img src="/favicon.svg" alt="" class="h-full w-full" />
        </div>
        <h1 class="mt-6 font-display text-3xl text-ink">
          {{ isSetupMode ? 'Welcome to Qmail' : 'Qmail' }}
        </h1>
        <p class="mt-2 text-sm text-ink-2">
          {{ isSetupMode ? 'Create your admin password to get started' : 'Sign in to your mailbox' }}
        </p>
      </div>

      <div class="card mt-8 p-6">
        <!-- Passkey sign-in -->
        <template v-if="showPasskey">
          <button
            class="btn btn-primary w-full"
            :disabled="isPasskeyLoading"
            @click="handlePasskeyLogin"
          >
            <svg v-if="!isPasskeyLoading" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 3.935m-3.44 2.04A7.965 7.965 0 004 11c0 1.017-.07 2.019-.203 3" />
            </svg>
            <span v-if="isPasskeyLoading" class="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            {{ isPasskeyLoading ? 'Waiting for passkey…' : 'Sign in with passkey' }}
          </button>

          <div class="flex items-center gap-3 my-5">
            <div class="flex-1 border-t border-edge"></div>
            <span class="text-xs text-ink-3">or use your password</span>
            <div class="flex-1 border-t border-edge"></div>
          </div>
        </template>

        <form class="space-y-4" @submit.prevent="handleSubmit">
          <div>
            <label for="password" class="label">Password</label>
            <input
              id="password"
              v-model="password"
              type="password"
              required
              autocomplete="current-password"
              :minlength="isSetupMode ? 8 : undefined"
              class="input"
              :placeholder="isSetupMode ? 'Create a password (min 8 characters)' : 'Enter your password'"
            />
          </div>

          <div v-if="isSetupMode">
            <label for="confirmPassword" class="label">Confirm password</label>
            <input
              id="confirmPassword"
              v-model="confirmPassword"
              type="password"
              required
              autocomplete="new-password"
              class="input"
              placeholder="Confirm your password"
            />
          </div>

          <div v-if="error" class="alert-error">{{ error }}</div>

          <button type="submit" :disabled="isLoading" class="btn btn-primary w-full">
            <span v-if="isLoading" class="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            {{ isLoading ? 'Please wait…' : (isSetupMode ? 'Create account' : 'Sign in') }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
