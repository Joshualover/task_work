<template>
  <div class="min-h-full bg-[#FFF7E6] p-4 sm:p-6">
    <!-- 标题 -->
    <div class="mx-auto mb-4 flex max-w-lg flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-[#1F2329]">任务记录</h1>
        <p class="mt-1 text-sm text-gray-500">
          {{
            currentChild
              ? `${currentChild.name}的历史任务与完成情况`
              : '通过日历查看过往任务'
          }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" class="rounded-full" @click="goToday">
          回到今天
        </Button>
      </div>
    </div>

    <div v-if="!currentChild" class="rounded-2xl bg-white p-8 text-center shadow-md">
      <p class="text-gray-500">请先选择一个孩子</p>
    </div>

    <template v-else>
      <!-- 月份切换 -->
      <div class="mx-auto mb-3 flex max-w-lg items-center justify-between rounded-2xl bg-white px-3 py-2 shadow-md">
        <button
          type="button"
          class="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-orange-50 hover:text-[#FF8A3D]"
          aria-label="上个月"
          @click="changeMonth(-1)"
        >
          <ChevronLeft class="h-5 w-5" />
        </button>
        <div class="text-center">
          <p class="text-lg font-semibold text-[#1F2329]">{{ monthLabel }}</p>
          <p class="text-xs text-gray-400">
            完成 {{ monthSummary.completed }} / 共 {{ monthSummary.total }}
          </p>
        </div>
        <button
          type="button"
          class="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-orange-50 hover:text-[#FF8A3D]"
          aria-label="下个月"
          @click="changeMonth(1)"
        >
          <ChevronRight class="h-5 w-5" />
        </button>
      </div>

      <!-- 日历 -->
      <div class="mx-auto max-w-lg rounded-2xl bg-white p-3 shadow-md sm:p-4">
        <div class="mb-2 grid grid-cols-7 gap-1 text-center text-sm text-gray-500">
          <span v-for="w in WEEKDAYS" :key="w">{{ w }}</span>
        </div>
        <div v-if="loading" class="py-10 text-center text-sm text-gray-400">
          加载中...
        </div>
        <div v-else class="grid grid-cols-7 gap-1">
          <template v-for="(cell, idx) in cells" :key="idx">
            <div v-if="cell === null" class="aspect-square rounded-xl" />
            <button
              v-else
              type="button"
              class="relative flex aspect-square flex-col items-center justify-center rounded-xl text-base font-semibold transition-colors"
              :class="cellClass(cell)"
              @click="selectedDate = dateKey(cell)"
            >
              <span class="font-medium">{{ cell }}</span>
              <span class="mt-0.5 flex h-1.5 items-center gap-0.5">
                <span
                  v-for="(c, i) in dotsFor(dateKey(cell))"
                  :key="i"
                  class="h-1.5 w-1.5 rounded-full"
                  :class="c"
                />
              </span>
            </button>
          </template>
        </div>
      </div>

      <!-- 选中日详情 -->
      <div class="mx-auto mt-4 max-w-lg rounded-2xl bg-white p-4 shadow-md">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-base font-semibold text-[#1F2329]">
            {{ selectedDate }}
            <span class="ml-1 text-sm font-normal text-gray-400">
              {{ WEEKDAY_FULL[weekdayOf(selectedDate)] }}
            </span>
          </h2>
          <span v-if="selectedTasks.length > 0" class="text-xs text-gray-500">
            完成 {{ selectedSummary.completed }}/{{ selectedSummary.total }}
          </span>
        </div>

        <div v-if="selectedTasks.length === 0" class="py-8 text-center text-sm text-gray-400">
          这天没有任务
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="task in selectedTasks"
            :key="task.id"
            class="flex items-start justify-between gap-3 rounded-xl border border-gray-100 p-3"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <BookOpen
                  v-if="task.type === 'homework'"
                  class="h-4 w-4 shrink-0 text-[#36BFFA]"
                />
                <Star v-else class="h-4 w-4 shrink-0 text-[#FF8A3D]" />
                <span
                  class="truncate text-sm font-medium"
                  :class="
                    task.status === 'completed'
                      ? 'text-gray-400 line-through'
                      : 'text-[#1F2329]'
                  "
                >
                  {{ task.name }}
                </span>
              </div>
              <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                <span v-if="task.subject">{{ task.subject }}</span>
                <span v-if="(task.subtasks?.length ?? 0) > 0">
                  子任务 {{ task.subtasks?.filter((s) => s.isCompleted).length }}/{{ task.subtasks?.length }}
                </span>
              </div>
            </div>
            <div class="flex shrink-0 flex-col items-end gap-1">
              <span
                class="rounded-full px-2 py-0.5 text-xs font-medium"
                :class="STATUS_STYLE[task.status].cls"
              >
                {{ STATUS_STYLE[task.status].label }}
              </span>
              <span
                v-if="task.isLateSubmit"
                class="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-[#FF4D4F]"
              >
                补提交
              </span>
              <span class="text-sm font-bold text-[#FF8A3D]">
                {{ task.finalPoints ?? task.points }} 分
              </span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ChevronLeft, ChevronRight, BookOpen, Star } from 'lucide-vue-next';
import { logger } from '@lark-apaas/client-toolkit/logger';

import Button from '@/components/ui/Button.vue';
import { taskApi } from '@/api';
import { useChildStore } from '@/stores/child';
import { todayString } from '@/utils/date';
import type { TaskInstance, TaskStatus } from '@shared/api.interface';

const props = withDefaults(
  defineProps<{ mode?: 'parent' | 'child' }>(),
  { mode: 'parent' },
);

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const WEEKDAY_FULL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const STATUS_STYLE: Record<TaskStatus, { label: string; cls: string }> = {
  pending: { label: '待完成', cls: 'bg-orange-50 text-[#FF8A3D]' },
  submitted: { label: '待确认', cls: 'bg-blue-50 text-[#36BFFA]' },
  completed: { label: '已完成', cls: 'bg-green-50 text-[#52C41A]' },
  overdue: { label: '已逾期', cls: 'bg-red-50 text-[#FF4D4F]' },
  rejected: { label: '已驳回', cls: 'bg-gray-100 text-gray-500' },
};

const childStore = useChildStore();
const currentChild = computed(() => childStore.currentChild);
const childId = computed(() => currentChild.value?.id ?? '');

const today = todayString();
const now = new Date();
const year = ref(now.getFullYear());
const month = ref(now.getMonth()); // 0-11
const loading = ref(false);
const tasksByDate = ref<Record<string, TaskInstance[]>>({});
const selectedDate = ref(today);

const monthLabel = computed(() => `${year.value}年${month.value + 1}月`);

const daysInMonth = computed(() =>
  new Date(year.value, month.value + 1, 0).getDate(),
);
/** 周一为一周第一天，(getDay()+6)%7 */
const firstWeekday = computed(
  () => (new Date(year.value, month.value, 1).getDay() + 6) % 7,
);

const cells = computed<Array<number | null>>(() => {
  const list: Array<number | null> = [];
  for (let i = 0; i < firstWeekday.value; i += 1) list.push(null);
  for (let d = 1; d <= daysInMonth.value; d += 1) list.push(d);
  return list;
});

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dateKey(day: number): string {
  return `${year.value}-${pad(month.value + 1)}-${pad(day)}`;
}

function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00`).getDay();
}

function summaryOf(list: TaskInstance[]) {
  return {
    total: list.length,
    completed: list.filter((t) => t.status === 'completed').length,
    pending: list.filter((t) => t.status === 'pending' || t.status === 'submitted')
      .length,
    overdue: list.filter((t) => t.status === 'overdue').length,
  };
}

const monthSummary = computed(() => {
  const all = Object.values(tasksByDate.value).flat();
  return summaryOf(all);
});

const selectedTasks = computed(() => tasksByDate.value[selectedDate.value] ?? []);
const selectedSummary = computed(() => summaryOf(selectedTasks.value));

/** 日期格下的指示点（最多 3 个：完成/进行中/逾期） */
function dotsFor(dateStr: string): string[] {
  const list = tasksByDate.value[dateStr];
  if (!list || list.length === 0) return [];
  const s = summaryOf(list);
  const dots: string[] = [];
  if (s.completed > 0) dots.push('bg-[#52C41A]');
  if (s.pending > 0) dots.push('bg-[#FF8A3D]');
  if (s.overdue > 0) dots.push('bg-[#FF4D4F]');
  return dots;
}

function cellClass(day: number): string {
  const dateStr = dateKey(day);
  const list = tasksByDate.value[dateStr];
  const isSelected = selectedDate.value === dateStr;
  const isToday = dateStr === today;
  const allDone =
    !!list && list.length > 0 && list.every((t) => t.status === 'completed');

  if (isSelected) return 'bg-[#FF8A3D] text-white shadow-md';
  if (isToday) return 'bg-orange-50 text-[#FF8A3D] ring-1 ring-[#FF8A3D]';
  if (allDone) return 'bg-green-50 text-[#52C41A]';
  return 'text-[#1F2329] hover:bg-orange-50';
}

async function fetchMonth(): Promise<void> {
  if (!childId.value) return;
  loading.value = true;
  try {
    const startDate = `${year.value}-${pad(month.value + 1)}-01`;
    const endDate = `${year.value}-${pad(month.value + 1)}-${pad(daysInMonth.value)}`;
    const result = await taskApi.listTasks({
      childId: childId.value,
      startDate,
      endDate,
    });
    const map: Record<string, TaskInstance[]> = {};
    for (const t of result.items) {
      (map[t.taskDate] ??= []).push(t);
    }
    tasksByDate.value = map;
  } catch (error) {
    logger.error('获取任务记录失败', error);
  } finally {
    loading.value = false;
  }
}

function changeMonth(delta: number): void {
  const d = new Date(year.value, month.value + delta, 1);
  year.value = d.getFullYear();
  month.value = d.getMonth();
  void fetchMonth();
}

function goToday(): void {
  year.value = now.getFullYear();
  month.value = now.getMonth();
  selectedDate.value = today;
  void fetchMonth();
}

onMounted(() => {
  selectedDate.value = today;
  void fetchMonth();
});

watch(childId, () => {
  void fetchMonth();
});

// 组件复用于家长/孩子两种模式
watch(
  () => props.mode,
  () => {
    void fetchMonth();
  },
);
</script>
