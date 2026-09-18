<template>
  <div class="min-h-full bg-[#FFF7E6] p-4 sm:p-6">
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-[#1F2329]">数据报表</h1>
      <p class="mt-1 text-sm text-gray-500">
        <template v-if="currentChild">
          当前孩子：{{ currentChild.name }} · 查看积分趋势与任务完成率统计
        </template>
        <template v-else>
          查看积分趋势与任务完成率统计
        </template>
      </p>
    </div>

    <template v-if="!currentChild">
      <div class="rounded-2xl bg-white p-8 shadow-md text-center">
        <p class="text-gray-500">请先选择一个孩子</p>
      </div>
    </template>

    <template v-else-if="loading">
      <div class="rounded-2xl bg-white p-8 shadow-md text-center">
        <p class="text-gray-400">加载中...</p>
      </div>
    </template>

    <template v-else-if="error">
      <div class="rounded-2xl bg-white p-8 shadow-md text-center">
        <p class="text-red-500">{{ error }}</p>
      </div>
    </template>

    <template v-else>
      <!-- 4 stat cards in 2x2 grid -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" data-ai-section-type="card-stat">
        <!-- 上周完成任务数 -->
        <div class="rounded-2xl bg-white p-4 shadow-md transition-shadow hover:shadow-lg">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-sm text-gray-500">上周完成任务</p>
              <p class="mt-2 text-3xl font-bold text-[#1F2329]">
                {{ stats?.lastWeekCompletedTasks ?? 0 }}
              </p>
              <p class="mt-1 text-xs text-gray-400">个任务</p>
            </div>
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-green-50">
              <CheckCircle2 class="h-5 w-5 text-[#52C41A]" />
            </div>
          </div>
        </div>

        <!-- 必要任务打卡率 -->
        <div class="rounded-2xl bg-white p-4 shadow-md transition-shadow hover:shadow-lg">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <p class="text-sm text-gray-500">必要任务打卡率</p>
              <p class="mt-2 text-3xl font-bold text-[#36BFFA]">
                {{ completionPercent }}%
              </p>
              <p class="mt-1 text-xs text-gray-400">近7天</p>
            </div>
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
              <Target class="h-5 w-5 text-[#36BFFA]" />
            </div>
          </div>
          <div class="mt-3">
            <div class="h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                class="h-full rounded-full bg-[#36BFFA] transition-all duration-500"
                :style="{ width: `${completionPercent}%` }"
              />
            </div>
          </div>
        </div>

        <!-- 累计获得积分 -->
        <div class="rounded-2xl bg-white p-4 shadow-md transition-shadow hover:shadow-lg">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-sm text-gray-500">累计获得积分</p>
              <p class="mt-2 text-3xl font-bold text-[#FF8A3D]">
                {{ stats?.totalPointsEarned ?? 0 }}
              </p>
              <p class="mt-1 text-xs text-gray-400">点</p>
            </div>
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50">
              <Coins class="h-5 w-5 text-[#FF8A3D]" />
            </div>
          </div>
        </div>

        <!-- 累计兑换次数 -->
        <div class="rounded-2xl bg-white p-4 shadow-md transition-shadow hover:shadow-lg">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-sm text-gray-500">累计兑换次数</p>
              <p class="mt-2 text-3xl font-bold text-[#1F2329]">
                {{ stats?.totalRedemptions ?? 0 }}
              </p>
              <p class="mt-1 text-xs text-gray-400">次</p>
            </div>
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-purple-50">
              <Gift class="h-5 w-5 text-purple-500" />
            </div>
          </div>
        </div>
      </div>

      <!-- Charts (CSS bar replacement) -->
      <div class="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <!-- 积分趋势 -->
        <div class="rounded-2xl bg-white p-4 shadow-md">
          <div class="mb-3 flex items-center gap-2">
            <TrendingUp class="h-5 w-5 text-[#FF8A3D]" />
            <h2 class="text-lg font-semibold text-[#1F2329]">积分趋势</h2>
            <span class="text-sm text-gray-400">（近4周）</span>
          </div>
          <div class="h-[300px]">
            <div class="flex h-full items-end justify-around gap-2 pb-10 pt-4">
              <div
                v-for="item in stats?.weeklyTrend ?? []"
                :key="item.week"
                class="flex flex-1 flex-col items-center gap-2"
              >
                <span class="text-sm font-semibold text-[#FF8A3D]">{{ item.points }}</span>
                <div
                  class="w-full max-w-[40px] rounded-t-lg bg-gradient-to-t from-[#FF8A3D] to-[#FFB37A] transition-all"
                  :style="{ height: `${trendBarHeight(item.points, 'points')}%` }"
                />
                <span class="text-xs text-gray-500">{{ item.week.slice(5) }}</span>
              </div>
            </div>
            <div class="mt-2 text-center text-xs text-gray-400">单位：积分</div>
          </div>
        </div>

        <!-- 完成率趋势 -->
        <div class="rounded-2xl bg-white p-4 shadow-md">
          <div class="mb-3 flex items-center gap-2">
            <Target class="h-5 w-5 text-[#36BFFA]" />
            <h2 class="text-lg font-semibold text-[#1F2329]">完成率趋势</h2>
            <span class="text-sm text-gray-400">（近4周）</span>
          </div>
          <div class="h-[300px]">
            <div class="flex h-full items-end justify-around gap-2 pb-10 pt-4">
              <div
                v-for="item in stats?.weeklyTrend ?? []"
                :key="item.week"
                class="flex flex-1 flex-col items-center gap-2"
              >
                <span class="text-sm font-semibold text-[#36BFFA]">
                  {{ Math.round(item.completionRate * 100) }}%
                </span>
                <div
                  class="w-full max-w-[40px] rounded-t-lg bg-gradient-to-t from-[#36BFFA] to-[#7DD3FC] transition-all"
                  :style="{ height: `${trendBarHeight(item.completionRate * 100, 'completion')}%` }"
                />
                <span class="text-xs text-gray-500">{{ item.week.slice(5) }}</span>
              </div>
            </div>
            <div class="mt-2 text-center text-xs text-gray-400">单位：%</div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { CheckCircle2, Target, Coins, Gift, TrendingUp } from 'lucide-vue-next';

import { reportApi } from '@/api';
import { useChildStore } from '@/stores/child';
import type { ReportStatsResponse } from '@shared/api.interface';

const childStore = useChildStore();

const stats = ref<ReportStatsResponse | null>(null);
const loading = ref<boolean>(true);
const error = ref<string | null>(null);

const currentChild = computed(() => childStore.currentChild);

const completionPercent = computed(() =>
  stats.value ? Math.round(stats.value.dailyTaskCompletionRate * 100) : 0,
);

function trendBarHeight(value: number, type: 'points' | 'completion'): number {
  const trend = stats.value?.weeklyTrend ?? [];
  if (trend.length === 0) return 0;
  if (type === 'completion') {
    // completion 已经是百分比 0-100
    return Math.max(5, value);
  }
  const maxVal = Math.max(...trend.map((t) => t.points), 1);
  return Math.max(5, (value / maxVal) * 80);
}

async function loadStats(): Promise<void> {
  if (!currentChild.value) return;
  try {
    loading.value = true;
    error.value = null;
    const data = await reportApi.getStats(currentChild.value.id);
    stats.value = data;
  } catch (err) {
    logger.error('Failed to load report stats', err as Error);
    error.value = '加载报表数据失败';
  } finally {
    loading.value = false;
  }
}

watch(
  () => currentChild.value?.id,
  () => {
    void loadStats();
  },
);

onMounted(() => {
  void loadStats();
});
</script>
