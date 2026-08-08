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

const isSetupMode = computed(() => authStore.needsSetup);

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
</script>

<template>
  <div class="login-page min-h-screen flex items-center justify-center p-4">
    <div class="login-card max-w-md w-full p-7 sm:p-9">
      <div>
        <div class="mx-auto q-login-logo">Q</div>
        <p class="mt-5 text-center text-xs font-bold uppercase tracking-[.25em] text-primary-600">QMail workspace</p>
        <h2 class="mt-2 text-center text-3xl font-extrabold tracking-tight text-gray-900">
          {{ isSetupMode ? 'Create your private inbox' : 'Welcome back' }}
        </h2>
        <p class="mt-2 text-center text-sm text-gray-600">
          {{ isSetupMode ? 'Set up your admin password to get started' : 'Enter your password to continue' }}
        </p>
      </div>

      <form class="mt-8 space-y-5" @submit.prevent="handleSubmit">
        <div class="rounded-md shadow-sm space-y-4">
          <div>
            <label for="password" class="block text-sm font-medium text-gray-700">Password</label>
            <input
              id="password"
              v-model="password"
              type="password"
              required
              :minlength="isSetupMode ? 8 : undefined"
              class="qm-input mt-1"
              :placeholder="isSetupMode ? 'Create a password (min 8 characters)' : 'Enter your password'"
            />
          </div>

          <div v-if="isSetupMode">
            <label for="confirmPassword" class="block text-sm font-medium text-gray-700">Confirm Password</label>
            <input
              id="confirmPassword"
              v-model="confirmPassword"
              type="password"
              required
              class="qm-input mt-1"
              placeholder="Confirm your password"
            />
          </div>
        </div>

        <div v-if="error" class="rounded-md bg-red-50 p-4">
          <div class="flex">
            <div class="flex-shrink-0">
              <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="ml-3">
              <p class="text-sm font-medium text-red-800">{{ error }}</p>
            </div>
          </div>
        </div>

        <div>
          <button
            type="submit"
            :disabled="isLoading"
            class="qm-button-primary relative w-full py-3"
          >
            <span v-if="isLoading" class="absolute left-0 inset-y-0 flex items-center pl-3">
              <div class="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            </span>
            {{ isLoading ? 'Please wait...' : (isSetupMode ? 'Create Account' : 'Sign In') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-page { background:radial-gradient(circle at 15% 20%,rgba(79,70,229,.16),transparent 32%),radial-gradient(circle at 90% 80%,rgba(37,99,235,.13),transparent 34%),#f5f7fb; }
.login-card { background:rgba(255,255,255,.88); border:1px solid rgba(203,213,225,.75); border-radius:24px; box-shadow:0 30px 80px rgba(15,23,42,.13); backdrop-filter:blur(18px); }
.q-login-logo { @apply flex items-center justify-center w-16 h-16 text-2xl font-black text-white rounded-2xl; background:linear-gradient(135deg,#6366f1,#2563eb); box-shadow:0 15px 34px rgba(37,99,235,.3); }
</style>
