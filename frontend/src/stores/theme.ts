import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'qmail_theme';

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export const useThemeStore = defineStore('theme', () => {
  const stored = localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
  const preference = ref<ThemePreference>(
    stored === 'light' || stored === 'dark' ? stored : 'system'
  );

  const systemDark = ref(systemPrefersDark());

  const isDark = computed(() =>
    preference.value === 'dark' || (preference.value === 'system' && systemDark.value)
  );

  function apply() {
    const dark = preference.value === 'dark' || (preference.value === 'system' && systemDark.value);
    const cls = document.documentElement.classList;
    cls.add(dark ? 'dark' : 'light');
    cls.remove(dark ? 'light' : 'dark');
  }

  function setPreference(value: ThemePreference) {
    preference.value = value;
    if (value === 'system') {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, value);
    }
    apply();
  }

  /** Cycle light → dark → system (used by the sidebar toggle) */
  function cycle() {
    const order: ThemePreference[] = ['light', 'dark', 'system'];
    setPreference(order[(order.indexOf(preference.value) + 1) % order.length]);
  }

  // Follow OS changes while in system mode
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    systemDark.value = e.matches;
    apply();
  });

  apply();

  return { preference, isDark, setPreference, cycle };
});
