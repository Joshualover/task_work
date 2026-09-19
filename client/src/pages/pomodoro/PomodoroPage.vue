<template>
  <div class="min-h-full bg-gradient-to-b from-[#FFE9CC] to-[#FFF7E6] p-4 sm:p-6">
    <div class="mx-auto max-w-md">
      <!-- 标题 -->
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-[#1F2329]">番茄钟</h1>
          <p class="mt-1 text-sm text-gray-500">专注一会儿，就休息一下</p>
        </div>
        <span
          class="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-[#FF8A3D] shadow-sm"
        >
          🍅 今日 {{ store.completedCount }}
        </span>
      </div>

      <!-- 模式切换 -->
      <div class="mb-4 flex rounded-full bg-white p-1 shadow-sm">
        <button
          v-for="m in MODES"
          :key="m.value"
          type="button"
          class="flex-1 rounded-full px-3 py-2 text-sm font-medium transition-colors"
          :class="
            store.mode === m.value
              ? modeActiveClass(m.value)
              : 'text-gray-500 hover:text-[#1F2329]'
          "
          @click="store.setMode(m.value)"
        >
          {{ m.label }}
        </button>
      </div>

      <!-- 计时器 -->
      <div class="rounded-3xl bg-white p-6 shadow-lg">
        <div class="relative mx-auto flex h-60 w-60 items-center justify-center sm:h-64 sm:w-64">
          <svg class="h-full w-full -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" fill="none" stroke="#F3F4F6" stroke-width="8" />
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              :stroke="ringColor"
              stroke-width="8"
              stroke-linecap="round"
              :stroke-dasharray="CIRCUMFERENCE"
              :stroke-dashoffset="CIRCUMFERENCE * (1 - store.progress)"
              class="transition-[stroke-dashoffset] duration-300 ease-linear"
            />
          </svg>
          <div class="absolute flex flex-col items-center">
            <span class="text-5xl font-extrabold tabular-nums text-[#1F2329]">
              {{ mmss }}
            </span>
            <span class="mt-1 text-sm text-gray-400">{{ modeLabel }}</span>
            <span
              v-if="store.focusTaskName"
              class="mt-2 max-w-[9rem] truncate rounded-full bg-orange-50 px-3 py-1 text-xs text-[#FF8A3D]"
            >
              正在做：{{ store.focusTaskName }}
            </span>
          </div>
        </div>

        <div class="mt-6 flex items-center justify-center gap-4">
          <button
            type="button"
            class="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200"
            title="重置"
            @click="store.reset()"
          >
            <RotateCcw class="h-5 w-5" />
          </button>
          <button
            type="button"
            class="flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95"
            :style="{ backgroundColor: ringColor }"
            @click="store.toggle()"
          >
            <Pause v-if="store.running" class="h-7 w-7" />
            <Play v-else class="ml-1 h-7 w-7" />
          </button>
          <button
            type="button"
            class="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200"
            title="跳过"
            @click="store.skip()"
          >
            <SkipForward class="h-5 w-5" />
          </button>
        </div>
      </div>

      <!-- 专注任务 -->
      <div class="mt-4 rounded-2xl bg-white p-4 shadow-md">
        <p class="mb-2 text-sm font-medium text-[#1F2329]">专注任务（可选）</p>
        <Select
          v-model:modelValue="focusId"
          :options="taskOptions"
          placeholder="选择今天的一个任务"
        />
      </div>

      <!-- 时长设置 -->
      <details class="mt-4 rounded-2xl bg-white p-4 shadow-md">
        <summary class="cursor-pointer text-sm font-medium text-[#1F2329]">
          时长设置
        </summary>
        <div class="mt-3 grid grid-cols-3 gap-3">
          <div v-for="m in MODES" :key="m.value">
            <label class="mb-1 block text-xs text-gray-500">{{ m.label }}（分钟）</label>
            <Input
              type="number"
              :value="String(store.durations[m.value])"
              @update:value="(v: string | number) => store.setDuration(m.value, Number(v))"
              class="rounded-xl text-sm h-9"
            />
          </div>
        </div>
        <p class="mt-2 text-xs text-gray-400">
          每完成 4 个番茄会自动进入一次长休息
        </p>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Play, Pause, RotateCcw, SkipForward } from 'lucide-vue-next';
import { logger } from '@lark-apaas/client-toolkit/logger';

import Input from '@/components/ui/Input.vue';
import Select from '@/components/ui/Select.vue';
import { taskApi } from '@/api';
import { useChildStore } from '@/stores/child';
import { usePomodoroStore, type PomodoroMode } from '@/stores/pomodoro';
import { todayString } from '@/utils/date';
import type { TaskInstance } from '@shared/api.interface';

const store = usePomodoroStore();
const childStore = useChildStore();
const tasks = ref<TaskInstance[]>([]);

const MODES: Array<{ value: PomodoroMode; label: string }> = [
  { value: 'work', label: '专注' },
  { value: 'short', label: '短休息' },
  { value: 'long', label: '长休息' },
];

const RING_COLORS: Record<PomodoroMode, string> = {
  work: '#FF8A3D',
  short: '#52C41A',
  long: '#36BFFA',
};

const CIRCUMFERENCE = 2 * Math.PI * 54;

const ringColor = computed(() => RING_COLORS[store.mode]);
const modeLabel = computed(
  () => MODES.find((m) => m.value === store.mode)?.label ?? '',
);

function modeActiveClass(m: PomodoroMode): string {
  if (m === 'work') return 'bg-[#FF8A3D] text-white shadow-md';
  if (m === 'short') return 'bg-[#52C41A] text-white shadow-md';
  return 'bg-[#36BFFA] text-white shadow-md';
}

const mmss = computed(() => {
  const s = store.remainingSeconds;
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
});

const taskOptions = computed(() =>
  tasks.value.map((t) => ({
    value: t.id,
    label: t.type === 'homework' ? `${t.name}（作业）` : t.name,
  })),
);

const focusId = computed({
  get: () => store.focusTaskId,
  set: (value: string) => {
    const opt = taskOptions.value.find((o) => o.value === value);
    store.setFocus(value, opt?.label ?? '');
  },
});

onMounted(async () => {
  const childId = childStore.currentChild?.id;
  if (!childId) return;
  try {
    const result = await taskApi.listTasks({
      childId,
      date: todayString(),
    });
    tasks.value = result.items;
  } catch (error) {
    logger.error('获取今日任务失败', error);
  }
});
</script>
