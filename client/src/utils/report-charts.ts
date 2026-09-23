/**
 * 报表趋势图的 ECharts option 构造（纯函数，便于单元测试 / SSR 校验）。
 *
 * 只返回普通对象，不依赖 echarts 运行时，组件里拿到后直接 setOption。
 */
import type { ReportStatsResponse } from '@shared/api.interface';

export type TrendPoint = ReportStatsResponse['weeklyTrend'][number];

const COLOR_ORANGE = '#FF8A3D';
const COLOR_BLUE = '#36BFFA';
const AXIS_LABEL_COLOR = '#9CA3AF';

/** 周标签：2026-09-07 -> 09/07 */
export function trendLabels(trend: TrendPoint[]): string[] {
  return trend.map((t) => t.week.slice(5).replace('-', '/'));
}

const baseGrid = { left: 4, right: 12, top: 34, bottom: 4, containLabel: true };

const categoryAxis = (labels: string[], boundaryGap = false) => ({
  type: 'category' as const,
  boundaryGap,
  data: labels,
  axisTick: { show: false },
  axisLine: { lineStyle: { color: '#E5E7EB' } },
  axisLabel: { color: AXIS_LABEL_COLOR, fontSize: 12 },
});

/** 积分趋势：橙色渐变柱状图 */
export function pointsTrendOption(trend: TrendPoint[]) {
  return {
    grid: baseGrid,
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'shadow' as const },
      valueFormatter: (value: unknown) => `${value} 积分`,
    },
    xAxis: categoryAxis(trendLabels(trend), true),
    yAxis: {
      type: 'value' as const,
      minInterval: 1,
      splitLine: { lineStyle: { color: '#F3F4F6' } },
      axisLabel: { color: AXIS_LABEL_COLOR, fontSize: 12 },
    },
    series: [
      {
        name: '获得积分',
        type: 'bar' as const,
        data: trend.map((t) => t.points),
        barMaxWidth: 38,
        showBackground: true,
        backgroundStyle: { color: '#FFF7E6', borderRadius: [8, 8, 0, 0] },
        itemStyle: {
          borderRadius: [8, 8, 0, 0],
          color: {
            type: 'linear' as const,
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: '#FFB37A' },
              { offset: 1, color: COLOR_ORANGE },
            ],
          },
        },
        label: {
          show: true,
          position: 'top' as const,
          color: COLOR_ORANGE,
          fontWeight: 600 as const,
          fontSize: 12,
        },
      },
    ],
  };
}

/** 完成率趋势：蓝色平滑折线 + 面积渐变 */
export function completionRateOption(trend: TrendPoint[]) {
  return {
    grid: baseGrid,
    tooltip: {
      trigger: 'axis' as const,
      valueFormatter: (value: unknown) => `${value}%`,
    },
    xAxis: categoryAxis(trendLabels(trend), false),
    yAxis: {
      type: 'value' as const,
      min: 0,
      max: 100,
      interval: 25,
      splitLine: { lineStyle: { color: '#F3F4F6' } },
      axisLabel: {
        color: AXIS_LABEL_COLOR,
        fontSize: 12,
        formatter: '{value}%',
      },
    },
    series: [
      {
        name: '完成率',
        type: 'line' as const,
        smooth: true,
        data: trend.map((t) => Math.round(t.completionRate * 100)),
        symbol: 'circle' as const,
        symbolSize: 9,
        itemStyle: { color: COLOR_BLUE, borderColor: '#fff', borderWidth: 2 },
        lineStyle: { width: 3, color: COLOR_BLUE },
        areaStyle: {
          color: {
            type: 'linear' as const,
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(54,191,250,0.32)' },
              { offset: 1, color: 'rgba(54,191,250,0.02)' },
            ],
          },
        },
        label: {
          show: true,
          position: 'top' as const,
          formatter: '{c}%',
          color: COLOR_BLUE,
          fontWeight: 600 as const,
          fontSize: 12,
        },
      },
    ],
  };
}
