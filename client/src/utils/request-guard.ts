/**
 * 请求竞态守卫：防止"快速切换孩子/翻页"时，慢的旧响应覆盖新的响应数据。
 *
 * 用法（每个需要保护的请求函数各建一个 guard）：
 * ```ts
 * const guard = createLatestGuard();
 * const fetchList = async () => {
 *   const isLatest = guard();          // 每次调用记为"最新一次"
 *   loading.value = true;
 *   try {
 *     const result = await api.list();
 *     if (!isLatest()) return;         // 已有更新的请求发出，丢弃本次结果
 *     items.value = result.items;
 *   } finally {
 *     if (isLatest()) loading.value = false; // 只有最新请求有权收 loading
 *   }
 * };
 * ```
 */
/** 调用 guard() 记为最新请求，返回的检查函数用于判断本次响应是否仍是最新 */
export type LatestGuardCheck = () => boolean;
export type LatestGuard = () => LatestGuardCheck;

export function createLatestGuard(): LatestGuard {
  let seq = 0;
  return () => {
    const current = ++seq;
    return () => current === seq;
  };
}
