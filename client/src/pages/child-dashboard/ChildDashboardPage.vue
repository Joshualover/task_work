<template>
  <template v-if="!currentChild">
    <div class="min-h-full bg-gradient-to-b from-[#E0F2FE] to-[#FFF7E6] p-4 sm:p-6">
      <div class="rounded-2xl bg-white p-8 shadow-md text-center">
        <p class="text-gray-500">请先选择一个孩子</p>
      </div>
    </div>
  </template>

  <template v-else>
    <div class="min-h-full bg-gradient-to-b from-[#E0F2FE] to-[#FFF7E6] pb-8">
      <!-- Success toast -->
      <Transition name="fade">
        <div
          v-if="showSuccess"
          class="fixed left-1/2 top-20 z-50 -translate-x-1/2 transform"
        >
          <div class="flex items-center gap-2 rounded-full bg-[#52C41A] px-6 py-3 text-white shadow-lg">
            <PartyPopper class="h-5 w-5" />
            <span class="font-medium">{{ encouragement }}</span>
          </div>
        </div>
      </Transition>

      <!-- Hero section: avatar + name + points -->
      <div class="px-4 pb-4 pt-6 sm:px-6 sm:pb-6 sm:pt-8">
        <div class="rounded-3xl bg-gradient-to-br from-[#36BFFA] via-[#60A5FA] to-[#A855F7] p-6 text-white shadow-xl">
          <!-- Decorative sparkles -->
          <div class="relative">
            <Sparkles class="absolute -right-2 -top-2 h-8 w-8 text-yellow-300" />
            <Star class="absolute -left-1 top-4 h-5 w-5 text-yellow-200" />
          </div>

          <div class="flex items-center gap-4">
            <div class="relative">
              <div class="flex h-20 w-20 items-center justify-center rounded-full bg-white/30 text-4xl ring-4 ring-white/50">
                <span v-if="!currentChild.avatarUrl">🧒</span>
                <img
                  v-else
                  :src="currentChild.avatarUrl"
                  :alt="currentChild.name"
                  class="h-full w-full rounded-full object-cover"
                />
              </div>
              <div class="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-yellow-400 shadow-md">
                <Trophy class="h-4 w-4 text-white" />
              </div>
            </div>
            <div>
              <p class="text-lg font-medium text-white/90">你好呀~</p>
              <h1 class="text-3xl font-bold">{{ currentChild.name }}</h1>
            </div>
          </div>

          <div class="mt-5 flex items-end justify-between">
            <div>
              <p class="text-sm text-white/80">我的积分</p>
              <div class="flex items-baseline gap-1">
                <span class="text-5xl font-extrabold drop-shadow-md">
                  {{ points }}
                </span>
                <span class="text-lg text-white/90">点</span>
              </div>
            </div>
            <div class="text-right">
              <p class="text-sm text-white/80">今日进度</p>
              <p class="text-2xl font-bold">
                {{ completedCount }}/{{ totalCount }}
              </p>
              <p class="text-xs text-white/70">任务完成</p>
            </div>
          </div>

          <!-- Progress bar -->
          <div class="mt-4 h-3 w-full overflow-hidden rounded-full bg-white/20">
            <div
              class="h-full rounded-full bg-gradient-to-r from-yellow-300 to-yellow-400 transition-all duration-500"
              :style="{ width: progressPercent }"
            />
          </div>
        </div>
      </div>

      <!-- Task list -->
      <div class="px-4 sm:px-6">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-xl font-bold text-[#1F2329]">📋 今日任务</h2>
          <span class="text-sm text-gray-500">共 {{ tasks.length }} 个</span>
        </div>

        <div v-if="loading" class="rounded-2xl bg-white p-8 text-center shadow-md">
          <p class="text-gray-400">加载中...</p>
        </div>
        <div v-else-if="tasks.length === 0" class="rounded-2xl bg-white p-8 text-center shadow-md">
          <div class="mb-3 text-5xl">🎉</div>
          <p class="text-lg font-semibold text-[#1F2329]">
            今日任务已全部完成！
          </p>
          <p class="mt-1 text-sm text-gray-500">继续保持～ 你真棒！</p>
        </div>
        <div v-else class="space-y-3" data-ai-section-type="card-list">
          <div
            v-for="task in tasks"
            :key="task.id"
            :class="[
              'rounded-2xl p-4 shadow-md transition-all hover:shadow-lg',
              task.status === 'pending' ? 'bg-white' : 'bg-white/70',
            ]"
            :style="taskCardStyle(task)"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <h3
                    :class="[
                      'text-base font-semibold',
                      task.status === 'completed'
                        ? 'text-gray-400 line-through'
                        : 'text-[#1F2329]',
                    ]"
                  >
                    {{ task.name }}
                  </h3>
                </div>
                <div class="mt-2 flex items-center gap-2 flex-wrap">
                  <span
                    :class="[
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      task.type === 'daily'
                        ? 'bg-orange-100 text-orange-600'
                        : 'bg-blue-100 text-blue-600',
                    ]"
                  >
                    {{ task.type === 'daily' ? '必要任务' : '作业任务' }}
                  </span>
                  <span
                    :class="[
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      STATUS_CONFIG[task.status].bg,
                      STATUS_CONFIG[task.status].color,
                    ]"
                  >
                    {{ STATUS_CONFIG[task.status].label }}
                  </span>
                  <button
                    v-if="hasSubtasks(task.id)"
                    type="button"
                    @click="toggleTaskExpand(task.id)"
                    class="flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-600 transition-colors hover:bg-purple-100"
                  >
                    <ListChecks class="h-3 w-3" />
                    <span>{{ completedSubtaskCount(task.id) }}/{{ getSubtasks(task.id).length }} 子任务</span>
                    <ChevronDown
                      v-if="expandedTasks.has(task.id)"
                      class="h-3 w-3"
                    />
                    <ChevronRight v-else class="h-3 w-3" />
                  </button>
                </div>
                <p v-if="task.subject" class="mt-1 text-sm text-gray-500">
                  科目：{{ task.subject }}
                </p>
                <p
                  v-if="task.type === 'homework' && task.deadline"
                  class="mt-1 text-xs text-gray-400"
                >
                  截止 {{ task.deadline }}
                  <span v-if="(task.extendDays ?? 0) > 0" class="text-[#FF8A3D]">
                    （可顺延 {{ task.extendDays }} 天，至 {{ effectiveDeadline(task) }}）
                  </span>
                </p>

                <!-- 子任务列表 -->
                <div
                  v-if="hasSubtasks(task.id) && expandedTasks.has(task.id)"
                  class="mt-3 space-y-2 rounded-xl bg-gray-50 p-3"
                >
                  <div
                    v-for="subtask in getSubtasks(task.id)"
                    :key="subtask.id"
                    class="flex items-start gap-2"
                  >
                    <button
                      type="button"
                      @click="handleToggleSubtask(task.id, subtask)"
                      :disabled="task.status !== 'pending' || togglingSubtaskIds.has(subtask.id)"
                      class="mt-0.5 flex-shrink-0 transition-transform active:scale-90 disabled:cursor-not-allowed"
                    >
                      <CheckCircle2
                        v-if="subtask.isCompleted"
                        class="h-5 w-5 text-[#52C41A] fill-[#52C41A]/10"
                      />
                      <Circle
                        v-else
                        class="h-5 w-5 text-gray-300"
                      />
                    </button>
                    <span
                      :class="[
                        'flex-1 text-sm',
                        subtask.isCompleted
                          ? 'text-gray-400 line-through'
                          : 'text-[#1F2329]',
                      ]"
                    >
                      {{ subtask.content }}
                    </span>
                  </div>
                </div>
              </div>

              <div class="flex flex-col items-end gap-2">
                <div class="flex items-center gap-1">
                  <Star class="h-4 w-4 text-yellow-400 fill-yellow-400" />
                  <span class="text-lg font-bold text-[#FF8A3D]">
                    +{{ task.points }}
                  </span>
                </div>
                <button
                  v-if="task.status === 'pending'"
                  type="button"
                  @click="handleSubmitClick(task)"
                  :disabled="hasSubtasks(task.id) && !allSubtasksCompleted(task.id)"
                  :title="hasSubtasks(task.id) && !allSubtasksCompleted(task.id) ? '请先完成所有子任务' : ''"
                  :class="[
                    'flex items-center gap-1 rounded-full px-4 py-1.5 text-sm font-medium shadow-md transition-all active:scale-95',
                    hasSubtasks(task.id) && !allSubtasksCompleted(task.id)
                      ? 'cursor-not-allowed bg-gray-300 text-gray-500 shadow-none'
                      : 'bg-gradient-to-r from-[#52C41A] to-[#7BCF4A] text-white hover:shadow-lg',
                  ]"
                >
                  <Check class="h-4 w-4" />
                  我完成了
                </button>
                <p
                  v-if="
                    task.status === 'pending' &&
                    hasSubtasks(task.id) &&
                    !allSubtasksCompleted(task.id)
                  "
                  class="text-xs text-gray-400"
                >
                  请先完成所有子任务
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Encouragement bottom -->
      <div class="mt-6 px-4 sm:px-6">
        <div class="rounded-2xl bg-gradient-to-r from-yellow-50 to-orange-50 p-4 text-center">
          <p class="text-sm text-[#FF8A3D]">
            {{ encouragementText }}
          </p>
        </div>
      </div>

      <!-- Submit confirm dialog -->
      <Dialog v-model:model-value="submitDialogOpen" title="确认完成">
        <div class="space-y-3">
          <p class="text-center text-sm text-gray-500">
            {{ selectedTask ? `「${selectedTask.name}」` : '' }}
          </p>
          <p class="text-sm text-gray-500">告诉家长你是怎么完成的（选填）：</p>
          <Textarea
            v-model:model-value="submitNote"
            placeholder="比如：我认真读了30分钟书..."
            :rows="4"
            class="min-h-[100px] rounded-xl"
          />
        </div>
        <template #footer>
          <Button
            variant="outline"
            @click="submitDialogOpen = false"
            class="flex-1 rounded-full"
            :disabled="submitting"
          >
            再想想
          </Button>
          <Button
            @click="handleConfirmSubmit"
            class="flex-1 rounded-full bg-[#52C41A] hover:bg-[#45A91A]"
            :disabled="submitting"
          >
            {{ submitting ? '提交中...' : '确认完成' }}
          </Button>
        </template>
      </Dialog>
    </div>
  </template>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { logger } from '@lark-apaas/client-toolkit/logger';
import {
  Star,
  Check,
  Trophy,
  Sparkles,
  PartyPopper,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  ListChecks,
} from 'lucide-vue-next';

import { taskApi, pointApi, aiApi } from '@/api';
import { useChildStore } from '@/stores/child';
import { todayString } from '@/utils/date';
import { taskCardStyle } from '@/utils/subject-image';
import Dialog from '@/components/ui/Dialog.vue';
import Button from '@/components/ui/Button.vue';
import Textarea from '@/components/ui/Textarea.vue';
import type { TaskInstance, TaskStatus, HomeworkSubtask, HomeworkSuggestion } from '@shared/api.interface';

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  pending: { label: '待完成', color: 'text-yellow-600', bg: 'bg-yellow-100' },
  submitted: { label: '待确认', color: 'text-blue-600', bg: 'bg-blue-100' },
  completed: { label: '已完成', color: 'text-green-600', bg: 'bg-green-100' },
  overdue: { label: '已逾期', color: 'text-red-600', bg: 'bg-red-100' },
  rejected: { label: '已驳回', color: 'text-gray-600', bg: 'bg-gray-100' },
};

const ENCOURAGEMENTS = [
  '太棒了！继续加油！🌟',
  '你真厉害！💪',
  '做得好！积分+1！✨',
  '哇！你真是小能手！🏆',
  '每天进步一点点！🚀',
];

const childStore = useChildStore();

const tasks = ref<TaskInstance[]>([]);
const loading = ref<boolean>(true);
const submitting = ref<boolean>(false);
const selectedTask = ref<TaskInstance | null>(null);
const submitNote = ref<string>('');
const showSuccess = ref<boolean>(false);
const encouragement = ref<string>('');
const points = ref<number>(0);

// 子任务相关状态
interface TaskSubtaskMap {
  [taskId: string]: {
    suggestionId: string;
    subtasks: HomeworkSubtask[];
  };
}
const subtaskMap = ref<TaskSubtaskMap>({});
const expandedTasks = ref<Set<string>>(new Set());
const togglingSubtaskIds = ref<Set<string>>(new Set());

const currentChild = computed(() => childStore.currentChild);

const submitDialogOpen = computed({
  get: () => selectedTask.value !== null,
  set: (val: boolean) => {
    if (!val) selectedTask.value = null;
  },
});

const todayStr = computed(() => todayString());

/** 作业的实际可完成截止日 = 截止日 + 顺延天数 */
const effectiveDeadline = (task: TaskInstance): string | null => {
  if (!task.deadline) return null;
  const days = task.extendDays ?? 0;
  if (days <= 0) return task.deadline;
  const d = new Date(`${task.deadline}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const completedCount = computed(() =>
  tasks.value.filter((t: TaskInstance) => t.status === 'completed').length,
);

const totalCount = computed(() => tasks.value.length);

const progressPercent = computed(() =>
  totalCount.value > 0 ? `${(completedCount.value / totalCount.value) * 100}%` : '0%',
);

const encouragementText = computed(() => {
  if (completedCount.value === totalCount.value && tasks.value.length > 0) {
    return '🏆 哇！今天所有任务都完成啦！你真是最棒的！';
  }
  if (completedCount.value > 0) {
    return `✨ 已完成 ${completedCount.value} 个任务，继续加油！`;
  }
  return '💪 新的一天开始啦，第一个任务等你挑战！';
});

async function loadTasks(): Promise<void> {
  if (!currentChild.value) return;
  try {
    loading.value = true;
    const [taskResult, balanceResult, suggestionResult] = await Promise.all([
      taskApi.listTasks({
        childId: currentChild.value.id,
        date: todayStr.value,
      }),
      pointApi.getBalance(currentChild.value.id),
      aiApi.getSuggestions(currentChild.value.id, 'confirmed'),
    ]);
    tasks.value = taskResult.items;
    points.value = balanceResult.balance;

    // 优先使用 task_instance.suggestion_id 精准关联（新数据）；
    // 历史数据（该字段为空）退化为 name+subject+points 匹配。
    const suggestionById = new Map<string, HomeworkSuggestion>(
      suggestionResult.items.map((s) => [s.id, s]),
    );
    const map: TaskSubtaskMap = {};
    for (const task of taskResult.items) {
      if (task.type !== 'homework') continue;
      const matched =
        (task.suggestionId ? suggestionById.get(task.suggestionId) : undefined) ??
        suggestionResult.items.find(
          (s) =>
            s.content === task.name &&
            s.subject === task.subject &&
            s.suggestedPoints === task.points,
        );
      if (matched && matched.subtasks && matched.subtasks.length > 0) {
        map[task.id] = {
          suggestionId: matched.id,
          subtasks: [...matched.subtasks].sort((a, b) => a.sortOrder - b.sortOrder),
        };
      }
    }
    subtaskMap.value = map;
  } catch (err) {
    logger.error('Failed to load child tasks', err as Error);
  } finally {
    loading.value = false;
  }
}

function handleSubmitClick(task: TaskInstance): void {
  // 有子任务且未全部完成时，不允许提交
  const subtaskInfo = subtaskMap.value[task.id];
  if (subtaskInfo && !allSubtasksCompleted(task.id)) {
    return;
  }
  selectedTask.value = task;
  submitNote.value = '';
}

function toggleTaskExpand(taskId: string): void {
  const next = new Set(expandedTasks.value);
  if (next.has(taskId)) {
    next.delete(taskId);
  } else {
    next.add(taskId);
  }
  expandedTasks.value = next;
}

function getSubtasks(taskId: string): HomeworkSubtask[] {
  return subtaskMap.value[taskId]?.subtasks ?? [];
}

function hasSubtasks(taskId: string): boolean {
  return getSubtasks(taskId).length > 0;
}

function allSubtasksCompleted(taskId: string): boolean {
  const subtasks = getSubtasks(taskId);
  if (subtasks.length === 0) return true;
  return subtasks.every((s: HomeworkSubtask) => s.isCompleted);
}

function completedSubtaskCount(taskId: string): number {
  return getSubtasks(taskId).filter((s: HomeworkSubtask) => s.isCompleted).length;
}

async function handleToggleSubtask(taskId: string, subtask: HomeworkSubtask): Promise<void> {
  const info = subtaskMap.value[taskId];
  if (!info) return;
  if (togglingSubtaskIds.value.has(subtask.id)) return;

  const toggling = new Set(togglingSubtaskIds.value);
  toggling.add(subtask.id);
  togglingSubtaskIds.value = toggling;

  // 乐观更新
  const newCompleted = !subtask.isCompleted;
  const updatedSubtasks = info.subtasks.map((s: HomeworkSubtask) =>
    s.id === subtask.id ? { ...s, isCompleted: newCompleted } : s,
  );
  subtaskMap.value = {
    ...subtaskMap.value,
    [taskId]: { ...info, subtasks: updatedSubtasks },
  };

  try {
    if (!currentChild.value) return;
    await aiApi.toggleSubtask(info.suggestionId, subtask.id, {
      childId: currentChild.value.id,
      isCompleted: newCompleted,
    });
    // 子任务全部完成后后端会自动完成任务，刷新列表以反映最新状态
    await loadTasks();
  } catch (err) {
    logger.error('Failed to toggle subtask', err as Error);
    // 回滚
    const rollbackSubtasks = info.subtasks.map((s: HomeworkSubtask) =>
      s.id === subtask.id ? { ...s, isCompleted: !newCompleted } : s,
    );
    subtaskMap.value = {
      ...subtaskMap.value,
      [taskId]: { ...info, subtasks: rollbackSubtasks },
    };
  } finally {
    const afterToggle = new Set(togglingSubtaskIds.value);
    afterToggle.delete(subtask.id);
    togglingSubtaskIds.value = afterToggle;
  }
}

async function handleConfirmSubmit(): Promise<void> {
  if (!selectedTask.value || submitting.value) return;
  try {
    submitting.value = true;
    await taskApi.submitTask(selectedTask.value.id, { completionNote: submitNote.value });
    encouragement.value = ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)];
    showSuccess.value = true;
    selectedTask.value = null;
    submitNote.value = '';
    // Refresh task list
    await loadTasks();
    // Hide success toast after 2s
    setTimeout(() => {
      showSuccess.value = false;
    }, 2000);
  } catch (err) {
    logger.error('Failed to submit task', err as Error);
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  void loadTasks();
});

// 顶部切换孩子后需要重新拉取当日任务 / 积分
watch(
  () => childStore.currentChildId,
  () => {
    if (currentChild.value) {
      void loadTasks();
    }
  },
);
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
