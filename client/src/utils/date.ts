/**
 * 统一日期工具。
 *
 * 项目面向国内家庭场景，任务日期 / 打卡日期需要与后端报表（Asia/Shanghai）保持一致。
 * 直接使用 `toISOString()`（UTC）会在北京时间 00:00–07:59 产生“昨天/今天”错位，
 * 直接使用浏览器本地时区则在非国内设备上产生偏差。
 * 因此统一按 UTC+8 计算“今天”。
 */

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 返回上海时区下的 `YYYY-MM-DD` */
export function todayString(now: Date = new Date()): string {
  const shanghai = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  const year = shanghai.getUTCFullYear();
  const month = String(shanghai.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shanghai.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
