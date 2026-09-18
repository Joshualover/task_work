/**
 * 服务端统一日期工具。
 *
 * 项目面向国内家庭场景，任务日期需要与前端（`client/src/utils/date.ts`）
 * 及报表统计（Asia/Shanghai）保持一致，避免 UTC 造成的跨日错位。
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
