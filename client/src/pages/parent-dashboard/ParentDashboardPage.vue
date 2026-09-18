<template>
  <div v-if="!currentChild" class="min-h-full bg-[#FFF7E6] p-4 sm:p-6">
    <div class="rounded-2xl bg-white p-8 shadow-md text-center">
      <p class="text-gray-500">请先添加孩子</p>
    </div>
  </div>

  <div v-else class="min-h-full bg-[#FFF7E6] p-4 sm:p-6">
    <!-- Welcome -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-[#1F2329]">
        {{ greeting }}，家长 👋
      </h1>
      <p class="mt-1 text-sm text-gray-500">
        当前孩子：<span class="font-medium text-[#FF8A3D]">{{ currentChild.name }}</span>
      </p>
    </div>

    <!-- Top row: points overview + today tasks -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <!-- Points overview card -->
      <div class="rounded-2xl bg-gradient-to-br from-[#FF8A3D] to-[#FFA94D] p-5 text-white shadow-md transition-shadow hover:shadow-lg">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-white/80">当前积分</p>
            <p class="mt-2 text-4xl font-bold">
              {{ currentChild.points }}
              <span class="ml-1 text-lg font-normal">点</span>
            </p>
            <div class="mt-3 flex items-center gap-1 text-sm text-white/90">
              <TrendingUp class="h-4 w-4" />
              <span>本周新增 {{ thisWeekPoints }} 点</span>
            </div>
          </div>
          <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
            <Coins class="h-7 w-7" />
          </div>
        </div>
      </div>

      <!-- Today tasks overview -->
      <div class="rounded-2xl bg-white p-5 shadow-md transition-shadow hover:shadow-lg">
        <div class="mb-3 flex items-center gap-2">
          <ClipboardList class="h-5 w-5 text-[#36BFFA]" />
          <h2 class="text-lg font-semibold text-[#1F2329]">今日任务概览</h2>
        </div>
        <div class="grid grid-cols-3 gap-3 text-center">
          <div class="rounded-xl bg-yellow-50 p-3">
            <p class="text-2xl font-bold text-yellow-600">{{ todayOverview.pending }}</p>
            <p class="mt-1 text-xs text-gray-500">待完成</p>
          </div>
          <div class="rounded-xl bg-blue-50 p-3">
            <p class="text-2xl font-bold text-[#36BFFA]">{{ todayOverview.submitted }}</p>
            <p class="mt-1 text-xs text-gray-500">待确认</p>
          </div>
          <div class="rounded-xl bg-green-50 p-3">
            <p class="text-2xl font-bold text-[#52C41A]">{{ todayOverview.completed }}</p>
            <p class="mt-1 text-xs text-gray-500">已完成</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Pending reminders -->
    <div class="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
      <router-link
        to="/tasks"
        class="flex items-center justify-between rounded-2xl bg-white p-4 shadow-md transition-shadow hover:shadow-lg"
      >
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
            <Clock class="h-5 w-5 text-[#36BFFA]" />
          </div>
          <div>
            <p class="font-medium text-[#1F2329]">待审核任务</p>
            <p class="text-sm text-gray-500">{{ todayOverview.submitted }} 个任务等待确认</p>
          </div>
        </div>
        <ChevronRight class="h-5 w-5 text-gray-400" />
      </router-link>

      <router-link
        to="/redemption"
        class="flex items-center justify-between rounded-2xl bg-white p-4 shadow-md transition-shadow hover:shadow-lg"
      >
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-full bg-purple-50">
            <AlertCircle class="h-5 w-5 text-purple-500" />
          </div>
          <div>
            <p class="font-medium text-[#1F2329]">待审核兑换</p>
            <p class="text-sm text-gray-500">{{ pendingRedemptions }} 个兑换申请等待处理</p>
          </div>
        </div>
        <ChevronRight class="h-5 w-5 text-gray-400" />
      </router-link>
    </div>

    <!-- Quick entries grid -->
    <div class="mt-6">
      <h2 class="mb-3 text-lg font-semibold text-[#1F2329]">快捷入口</h2>
      <div class="grid grid-cols-3 gap-3" data-ai-section-type="card-menu">
        <router-link
          v-for="entry in quickEntries"
          :key="entry.path"
          :to="entry.path"
          class="flex flex-col items-center gap-2 rounded-2xl bg-white p-4 shadow-md transition-all hover:shadow-lg hover:-translate-y-0.5"
        >
          <div :class="['flex h-12 w-12 items-center justify-center rounded-2xl', entry.bg]">
            <component :is="entry.icon" class="h-6 w-6" :style="{ color: entry.color }" />
          </div>
          <span class="text-sm font-medium text-[#1F2329]">{{ entry.label }}</span>
        </router-link>
      </div>
    </div>

    <!-- Recent transactions -->
    <div class="mt-6 rounded-2xl bg-white p-4 shadow-md">
      <div class="mb-3 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Sparkles class="h-5 w-5 text-[#FF8A3D]" />
          <h2 class="text-lg font-semibold text-[#1F2329]">最近积分流水</h2>
        </div>
        <router-link to="/points" class="text-sm text-[#FF8A3D] hover:underline">
          查看全部
        </router-link>
      </div>
      <div v-if="recentTransactions.length === 0" class="py-6 text-center text-sm text-gray-400">
        暂无积分流水
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="tx in recentTransactions"
          :key="tx.id"
          class="flex items-center justify-between rounded-xl bg-orange-50/50 p-3"
        >
          <div class="flex items-center gap-3">
            <div class="flex h-8 w-8 items-center justify-center rounded-full bg-white">
              <TrendingUp v-if="tx.changeAmount > 0" class="h-4 w-4 text-[#52C41A]" />
              <Coins v-else class="h-4 w-4 text-[#FF8A3D]" />
            </div>
            <div>
              <p class="text-sm font-medium text-[#1F2329]">
                {{ tx.reason ?? (tx.type === 'earn' ? '任务奖励' : tx.type === 'spend' ? '积分兑换' : '积分调整') }}
              </p>
              <p class="text-xs text-gray-500">
                {{ formatDate(tx.createdAt) }}
              </p>
            </div>
          </div>
          <span
            :class="[
              'text-base font-semibold',
              tx.changeAmount > 0 ? 'text-[#52C41A]' : 'text-[#FF4D4F]',
            ]"
          >
            {{ tx.changeAmount > 0 ? '+' : '' }}{{ tx.changeAmount }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { logger } from '@lark-apaas/client-toolkit/logger';
import {
  Coins,
  TrendingUp,
  ClipboardList,
  BookOpen,
  Gift,
  CheckCircle2,
  BarChart3,
  Clock,
  AlertCircle,
  ChevronRight,
  Sparkles,
} from 'lucide-vue-next';

import { taskApi, pointApi, redemptionApi } from '@/api';
import { useChildStore } from '@/stores/child';
import { todayString } from '@/utils/date';
import type { PointTransaction, TaskInstance } from '@shared/api.interface';

interface TodayOverview {
  pending: number;
  submitted: number;
  completed: number;
}

interface QuickEntry {
  path: string;
  label: string;
  icon: typeof Coins;
  color: string;
  bg: string;
}

const quickEntries: QuickEntry[] = [
  { path: '/task-templates', label: '任务配置', icon: ClipboardList, color: '#FF8A3D', bg: 'bg-orange-50' },
  { path: '/tasks', label: '作业池', icon: BookOpen, color: '#36BFFA', bg: 'bg-blue-50' },
  { path: '/rewards', label: '奖励管理', icon: Gift, color: '#52C41A', bg: 'bg-green-50' },
  { path: '/redemption', label: '兑换审核', icon: CheckCircle2, color: '#A855F7', bg: 'bg-purple-50' },
  { path: '/report', label: '报表统计', icon: BarChart3, color: '#F59E0B', bg: 'bg-amber-50' },
  { path: '/points', label: '积分流水', icon: Coins, color: '#EC4899', bg: 'bg-pink-50' },
];

const childStore = useChildStore();
const currentChild = computed(() => childStore.currentChild);

const todayOverview = ref<TodayOverview>({
  pending: 0,
  submitted: 0,
  completed: 0,
});
const recentTransactions = ref<PointTransaction[]>([]);
const pendingRedemptions = ref<number>(0);
const loading = ref<boolean>(true);
const thisWeekPoints = ref<number>(0);

const todayStr = computed(() => todayString());

const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 6) return '凌晨好';
  if (hour < 12) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
});

async function loadDashboard(): Promise<void> {
  if (!currentChild.value) return;

  try {
    loading.value = true;

    // Load today's tasks
    const tasksResult = await taskApi.listTasks({
      childId: currentChild.value.id,
      date: todayStr.value,
    });

    let pending = 0;
    let submitted = 0;
    let completed = 0;
    for (const task of tasksResult.items) {
      if (task.status === 'pending') pending++;
      else if (task.status === 'submitted') submitted++;
      else if (task.status === 'completed') completed++;
    }
    todayOverview.value = { pending, submitted, completed };

    // Load recent transactions
    const recentResult = await pointApi.listTransactions({
      childId: currentChild.value.id,
      page: 1,
      pageSize: 5,
    });
    recentTransactions.value = recentResult.items;

    // Calculate this week's earned points from recent transactions
    const now = new Date();
    const day = now.getDay();
    const daysSinceMonday = (day + 6) % 7;
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() - daysSinceMonday);
    thisMonday.setHours(0, 0, 0, 0);
    const weekEarned = recentResult.items
      .filter((t: PointTransaction) => t.type === 'earn' && new Date(t.createdAt) >= thisMonday)
      .reduce((sum: number, t: PointTransaction) => sum + t.changeAmount, 0);
    thisWeekPoints.value = weekEarned;

    // Load pending redemptions
    const redemptionResult = await redemptionApi.listRedemptions({
      childId: currentChild.value.id,
      status: 'pending',
    });
    pendingRedemptions.value = redemptionResult.items.length;
  } catch (err) {
    logger.error('Failed to load parent dashboard', err as Error);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (childStore.children.length === 0) {
    void childStore.fetchChildren();
  } else {
    void loadDashboard();
  }
});

watch(
  () => childStore.currentChildId,
  () => {
    if (childStore.currentChildId) {
      void loadDashboard();
    }
  },
);

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
</script>
