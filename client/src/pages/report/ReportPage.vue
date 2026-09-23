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

      <!-- 趋势图表（ECharts） -->
      <div class="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <!-- 积分趋势 -->
        <div class="rounded-2xl bg-white p-4 shadow-md">
          <div class="flex items-center gap-2">
            <TrendingUp class="h-5 w-5 text-[#FF8A3D]" />
            <h2 class="text-lg font-semibold text-[#1F2329]">积分趋势</h2>
            <span class="text-sm text-gray-400">（近 4 周）</span>
          </div>
          <p class="mb-1 text-xs text-gray-400">每周累计获得积分</p>
          <div ref="pointsChartRef" class="h-[260px] w-full"></div>
          <p v-if="noTrendData" class="mt-1 text-center text-xs text-gray-400">
            近 4 周还没有完成任务，通过审批后这里会显示趋势
          </p>
        </div>

        <!-- 完成率趋势 -->
        <div class="rounded-2xl bg-white p-4 shadow-md">
          <div class="flex items-center gap-2">
            <Target class="h-5 w-5 text-[#36BFFA]" />
            <h2 class="text-lg font-semibold text-[#1F2329]">完成率趋势</h2>
            <span class="text-sm text-gray-400">（近 4 周）</span>
          </div>
          <p class="mb-1 text-xs text-gray-400">每周完成任务 / 当周任务总数</p>
          <div ref="rateChartRef" class="h-[260px] w-full"></div>
          <p v-if="noTrendData" class="mt-1 text-center text-xs text-gray-400">
            暂无统计数据，布置任务后即可看到完成率变化
          </p>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { CheckCircle2, Target, Coins, Gift, TrendingUp } from 'lucide-vue-next';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

import { reportApi } from '@/api';
import { useChildStore } from '@/stores/child';
import { completionRateOption, pointsTrendOption } from '@/utils/report-charts';
import type { ReportStatsResponse } from '@shared/api.interface';

// 按需注册，避免把整个 echarts 打进产物
echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

const childStore = useChildStore();
const stats = ref<ReportStatsResponse | null>(null);
const loading = ref<boolean>(true);
const error = ref<string | null>(null);

const currentChild = computed(() => childStore.currentChild);

const completionPercent = computed(() =>
  stats.value ? Math.round(stats.value.dailyTaskCompletionRate * 100) : 0,
);

/** 近 4 周完全没有数据（用于展示引导文案，而不是空白图） */
const noTrendData = computed(() => {
  const trend = stats.value?.weeklyTrend ?? [];
  if (trend.length === 0) return true;
  return trend.every((t) => t.points === 0 && t.completionRate === 0);
});

// ==================== 图表 ====================
const pointsChartRef = ref<HTMLDivElement | null>(null);
const rateChartRef = ref<HTMLDivElement | null>(null);
let pointsChart: echarts.ECharts | null = null;
let rateChart: echarts.ECharts | null = null;

function renderPointsChart(): void {
  if (!pointsChartRef.value) return;
  pointsChart ??= echarts.init(pointsChartRef.value);
  pointsChart.setOption(pointsTrendOption(stats.value?.weeklyTrend ?? []));
}

function renderRateChart(): void {
  if (!rateChartRef.value) return;
  rateChart ??= echarts.init(rateChartRef.value);
  rateChart.setOption(completionRateOption(stats.value?.weeklyTrend ?? []));
}

/** 图表容器在 v-else 分支里，必须等 DOM 渲染后再初始化 */
async function renderCharts(): Promise<void> {
  await nextTick();
  renderPointsChart();
  renderRateChart();
  pointsChart?.resize();
  rateChart?.resize();
}

function disposeCharts(): void {
  pointsChart?.dispose();
  rateChart?.dispose();
  pointsChart = null;
  rateChart = null;
}

async function loadStats(): Promise<void> {
  if (!currentChild.value) return;
  try {
    loading.value = true;
    error.value = null;
    // 切换孩子时容器会被卸载，先销毁旧实例，避免挂在已脱离的 DOM 上
    disposeCharts();
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

// 数据到位 + 加载结束（此时 v-else 分支的图表容器才挂载）后重绘
watch([stats, loading], () => {
  if (loading.value || !stats.value) return;
  void renderCharts();
});

/** 窗口尺寸变化时自适应（含移动端旋转屏） */
function handleResize(): void {
  pointsChart?.resize();
  rateChart?.resize();
}

onMounted(() => {
  void loadStats();
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  disposeCharts();
});
</script>
