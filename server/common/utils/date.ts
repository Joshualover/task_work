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

export type PeriodFrequency = 'daily' | 'weekly' | 'monthly';

/**
 * 返回指定频率在当前时刻的周期区间（上海时区自然日/周/月），
 * 结果是对应上海本地 00:00 的 UTC 时刻，可直接与 timestamptz 比较。
 */
export function periodRangeUtc(
  frequency: PeriodFrequency,
  now: Date = new Date(),
): { start: Date; end: Date; startDate: string; endDate: string } {
  const sh = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  const y = sh.getUTCFullYear();
  const m = sh.getUTCMonth();
  const d = sh.getUTCDate();

  let startSh: number;
  let endSh: number;
  if (frequency === 'daily') {
    startSh = Date.UTC(y, m, d);
    endSh = startSh + 24 * 60 * 60 * 1000;
  } else if (frequency === 'weekly') {
    const daysSinceMonday = (sh.getUTCDay() + 6) % 7;
    startSh = Date.UTC(y, m, d - daysSinceMonday);
    endSh = startSh + 7 * 24 * 60 * 60 * 1000;
  } else {
    startSh = Date.UTC(y, m, 1);
    endSh = Date.UTC(m === 11 ? y + 1 : y, m === 11 ? 0 : m + 1, 1);
  }

  const toDate = (ms: number): string => {
    const t = new Date(ms + SHANGHAI_OFFSET_MS);
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
  };

  return {
    start: new Date(startSh - SHANGHAI_OFFSET_MS),
    end: new Date(endSh - SHANGHAI_OFFSET_MS),
    startDate: toDate(startSh),
    endDate: toDate(endSh),
  };
}
