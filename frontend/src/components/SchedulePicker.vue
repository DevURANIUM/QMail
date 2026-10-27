<script setup lang="ts">
import { computed, ref } from 'vue';
const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const today = new Date();
const month = ref(new Date(today.getFullYear(), today.getMonth(), 1));
const time = computed(() => props.modelValue.split('T')[1] || '09:00');
const selected = computed(() => props.modelValue.split('T')[0]);
const pad = (n: number) => String(n).padStart(2, '0');
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const title = computed(() => month.value.toLocaleDateString('en', { month: 'long', year: 'numeric' }));
const days = computed(() => Array.from({ length: 42 }, (_, i) => new Date(month.value.getFullYear(), month.value.getMonth(), i - month.value.getDay() + 1)));
function move(delta: number) { month.value = new Date(month.value.getFullYear(), month.value.getMonth() + delta, 1); }
function select(d: Date) { emit('update:modelValue', `${key(d)}T${time.value}`); }
function setTime(event: Event) { emit('update:modelValue', `${selected.value || key(today)}T${(event.target as HTMLInputElement).value}`); }
</script>

<template>
  <section class="schedule-picker" aria-label="Schedule delivery">
    <div class="calendar-heading">
      <strong aria-live="polite">{{ title }}</strong>
      <div class="flex gap-1">
        <button type="button" aria-label="Previous month" @click="move(-1)">‹</button>
        <button type="button" aria-label="Next month" @click="move(1)">›</button>
      </div>
    </div>
    <div class="calendar-days">
      <span v-for="day in ['Su','Mo','Tu','We','Th','Fr','Sa']" :key="day" class="weekday">{{ day }}</span>
      <button v-for="day in days" :key="key(day)" type="button"
        :aria-label="day.toLocaleDateString('en', { dateStyle: 'full' })"
        :aria-pressed="selected === key(day)" :aria-current="key(day) === key(today) ? 'date' : undefined"
        :disabled="key(day) < key(today)"
        :class="{ muted: day.getMonth() !== month.getMonth(), selected: selected === key(day) }"
        @click="select(day)">{{ day.getDate() }}</button>
    </div>
    <div class="calendar-time">
      <label for="schedule-time">Delivery time <span class="block text-xs text-ink-3">{{ Intl.DateTimeFormat().resolvedOptions().timeZone }}</span></label>
      <input id="schedule-time" type="time" :value="time" required class="input" @input="setTime" />
    </div>
    <div class="flex justify-between items-center mt-3 text-xs">
      <button type="button" @click="month = new Date(today.getFullYear(), today.getMonth(), 1); select(today)">Today</button>
      <button v-if="modelValue" type="button" @click="emit('update:modelValue', '')">Clear</button>
    </div>
  </section>
</template>

<style scoped>
.schedule-picker { width: 100%; max-width: 340px; padding: 18px; border: 1px solid var(--c-edge); border-radius: 16px; background: var(--c-surface); color: var(--c-ink); }
.calendar-heading { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; font-size: 14px; }
.calendar-heading button { width: 32px; height: 32px; font-size: 24px; border-radius: 8px; }
.calendar-days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; text-align: center; }
.weekday { font-size: 11px; color: var(--c-ink-2); padding-bottom: 8px; }
.calendar-days button { min-height: 36px; border-radius: 9px; font-size: 13px; }
button:hover:not(:disabled) { background: var(--c-surface-2); }
button:focus-visible { outline: 2px solid var(--c-accent); outline-offset: 2px; }
.calendar-days .muted { color: var(--c-ink-2); }
button:disabled { color: var(--c-ink-3); opacity: .5; }
.calendar-days .selected { background: var(--c-accent); color: var(--c-accent-ink); font-weight: 700; }
.calendar-time { border-top: 1px solid var(--c-edge); margin-top: 14px; padding-top: 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 13px; }
.calendar-time input { width: 115px; padding: 8px; }
</style>
