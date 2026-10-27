<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ActivityPoint } from '@/api/types';

const props = defineProps<{
  activity: ActivityPoint[];
}>();

// Geometry (viewBox units)
const W = 640;
const H = 200;
const PAD = { top: 10, right: 8, bottom: 24, left: 32 };
const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;

const hovered = ref<number | null>(null);

const maxCount = computed(() =>
  Math.max(1, ...props.activity.map(p => Math.max(p.received, p.sent)))
);

/** Round the axis maximum up to a friendly step (1, 2, 5 × 10^k) */
const niceMax = computed(() => {
  const max = maxCount.value;
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  for (const step of [1, 2, 5, 10]) {
    if (max <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
});

const yTicks = computed(() => {
  const max = niceMax.value;
  const mid = max / 2;
  return Number.isInteger(mid) && mid > 0 ? [0, mid, max] : [0, max];
});

const isEmpty = computed(() => props.activity.every(p => p.received === 0 && p.sent === 0));

const groupWidth = computed(() => plotW / Math.max(props.activity.length, 1));

// Thin bars: two per group with a 2px gap, capped width, centered
const barWidth = computed(() => {
  const available = (groupWidth.value - 8 - 2) / 2;
  return Math.max(3, Math.min(14, available));
});

function xForGroup(index: number): number {
  return PAD.left + index * groupWidth.value + groupWidth.value / 2;
}

function yForValue(value: number): number {
  return PAD.top + plotH * (1 - value / niceMax.value);
}

/** Bar path rounded at the data end only, anchored flat on the baseline */
function barPath(x: number, value: number, width: number): string {
  if (value <= 0) return '';
  const y = yForValue(value);
  const h = PAD.top + plotH - y;
  const r = Math.min(4, h, width / 2);
  const x2 = x + width;
  return [
    `M ${x} ${y + h}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x2 - r} ${y}`,
    `Q ${x2} ${y} ${x2} ${y + r}`,
    `L ${x2} ${y + h}`,
    'Z',
  ].join(' ');
}

function dayLabel(day: string, style: 'short' | 'long' = 'short'): string {
  const date = new Date(`${day}T00:00:00Z`);
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    ...(style === 'long' ? { weekday: 'short' } : {}),
    timeZone: 'UTC',
  });
}

// Label every other day to avoid collisions at 14 groups
function showXLabel(index: number): boolean {
  return (props.activity.length - 1 - index) % 2 === 0;
}

const tooltipStyle = computed(() => {
  if (hovered.value === null) return {};
  const centerPct = (xForGroup(hovered.value) / W) * 100;
  const flip = centerPct > 70;
  return {
    left: `${centerPct}%`,
    transform: flip ? 'translateX(-105%)' : 'translateX(8px)',
  };
});
</script>

<template>
  <div>
    <!-- Legend -->
    <div class="flex items-center gap-4 mb-3">
      <span class="flex items-center gap-1.5 text-xs text-ink-2">
        <span class="inline-block w-2.5 h-2.5 rounded-sm" style="background: var(--viz-1)"></span>
        Received
      </span>
      <span class="flex items-center gap-1.5 text-xs text-ink-2">
        <span class="inline-block w-2.5 h-2.5 rounded-sm" style="background: var(--viz-2)"></span>
        Sent
      </span>
    </div>

    <div class="relative">
      <svg
        :viewBox="`0 0 ${W} ${H}`"
        class="w-full h-auto block"
        role="img"
        aria-label="Daily email activity"
      >
        <!-- Gridlines + y labels -->
        <g v-for="tick in yTicks" :key="tick">
          <line
            :x1="PAD.left"
            :x2="W - PAD.right"
            :y1="yForValue(tick)"
            :y2="yForValue(tick)"
            :stroke="tick === 0 ? 'var(--viz-axis)' : 'var(--viz-grid)'"
            stroke-width="1"
          />
          <text
            :x="PAD.left - 6"
            :y="yForValue(tick) + 3"
            text-anchor="end"
            font-size="10"
            fill="var(--viz-muted)"
          >{{ tick }}</text>
        </g>

        <!-- Bars -->
        <g v-for="(point, i) in activity" :key="point.day">
          <path
            :d="barPath(xForGroup(i) - barWidth - 1, point.received, barWidth)"
            fill="var(--viz-1)"
            :opacity="hovered === null || hovered === i ? 1 : 0.4"
          />
          <path
            :d="barPath(xForGroup(i) + 1, point.sent, barWidth)"
            fill="var(--viz-2)"
            :opacity="hovered === null || hovered === i ? 1 : 0.4"
          />
          <text
            v-if="showXLabel(i)"
            :x="xForGroup(i)"
            :y="H - 8"
            text-anchor="middle"
            font-size="10"
            fill="var(--viz-muted)"
          >{{ dayLabel(point.day) }}</text>
        </g>

        <!-- Hover targets (wider than the marks) -->
        <rect
          v-for="(point, i) in activity"
          :key="`hit-${point.day}`"
          :x="PAD.left + i * groupWidth"
          :y="PAD.top"
          :width="groupWidth"
          :height="plotH"
          fill="transparent"
          @mouseenter="hovered = i"
          @mouseleave="hovered = null"
        />
      </svg>

      <!-- Tooltip -->
      <div
        v-if="hovered !== null && activity[hovered]"
        class="absolute top-2 pointer-events-none rounded-lg border border-edge bg-surface shadow-pop px-3 py-2 text-xs whitespace-nowrap z-10"
        :style="tooltipStyle"
      >
        <p class="font-medium text-ink mb-1">{{ dayLabel(activity[hovered].day, 'long') }}</p>
        <p class="flex items-center gap-1.5 text-ink-2">
          <span class="inline-block w-2 h-2 rounded-sm" style="background: var(--viz-1)"></span>
          Received <span class="font-medium text-ink ml-auto pl-3">{{ activity[hovered].received }}</span>
        </p>
        <p class="flex items-center gap-1.5 text-ink-2">
          <span class="inline-block w-2 h-2 rounded-sm" style="background: var(--viz-2)"></span>
          Sent <span class="font-medium text-ink ml-auto pl-3">{{ activity[hovered].sent }}</span>
        </p>
      </div>

      <!-- Empty overlay -->
      <div
        v-if="isEmpty"
        class="absolute inset-0 flex items-center justify-center pointer-events-none"
      >
        <p class="text-sm text-ink-3">No mail in this period</p>
      </div>
    </div>

    <!-- Accessible data table -->
    <table class="sr-only">
      <caption>Daily email activity</caption>
      <thead>
        <tr><th>Day</th><th>Received</th><th>Sent</th></tr>
      </thead>
      <tbody>
        <tr v-for="point in activity" :key="point.day">
          <td>{{ point.day }}</td>
          <td>{{ point.received }}</td>
          <td>{{ point.sent }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
