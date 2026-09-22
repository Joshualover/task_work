/**
 * 保持滚动位置的小工具。
 *
 * 背景：本项目的滚动容器是 Layout 里的 `<main class="flex-1 overflow-auto">`
 * （不是 window），列表刷新时如果中间出现「加载中」占位，内容高度骤降，
 * 浏览器会把 scrollTop 夹到 0，表现为「页面跳回顶部」。
 *
 * 用法：
 * ```ts
 * const restore = snapshotScroll();
 * await fetchList(true);   // 静默刷新，不显示占位
 * await nextTick();
 * restore();
 * ```
 */

interface ScrollTarget {
  el: HTMLElement;
  top: number;
  left: number;
}

/** 记录当前所有「已滚动」容器的位置，返回一个恢复函数 */
export function snapshotScroll(): () => void {
  if (typeof document === 'undefined') return () => {};

  const targets: ScrollTarget[] = [];

  const root = (document.scrollingElement as HTMLElement | null) ?? null;
  if (root && (root.scrollTop > 0 || root.scrollLeft > 0)) {
    targets.push({ el: root, top: root.scrollTop, left: root.scrollLeft });
  }

  // 页面内的滚动容器（<main> 以及弹窗内的可滚动区域）
  document.querySelectorAll<HTMLElement>('main, [data-scroll-keep]').forEach((el) => {
    if (el.scrollTop > 0 || el.scrollLeft > 0) {
      targets.push({ el, top: el.scrollTop, left: el.scrollLeft });
    }
  });

  return () => {
    for (const { el, top, left } of targets) {
      // 已脱离文档的节点直接跳过
      if (!el.isConnected) continue;
      el.scrollTop = top;
      el.scrollLeft = left;
    }
  };
}
