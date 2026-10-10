import { nextTick, onUnmounted, ref, watch, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

/**
 * 处理从顶部「提醒」下钻定位：
 * 携带 ?focus=<relatedId> 进入页面后，等数据加载完成，
 * 滚动到对应条目并短暂高亮，方便直接确认/处理。
 */
export function useNotificationFocus(ready: Ref<boolean>) {
  const route = useRoute();
  const router = useRouter();
  const focusId = ref<string | null>(null);
  let highlightTimer: number | null = null;

  async function locate(): Promise<void> {
    const id =
      typeof route.query.focus === 'string' ? route.query.focus : '';
    if (!id) return;

    focusId.value = id;
    await nextTick();

    const el = document.getElementById(`notif-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    if (highlightTimer != null) window.clearTimeout(highlightTimer);
    highlightTimer = window.setTimeout(() => {
      focusId.value = null;
      highlightTimer = null;
      // 清理 URL 上的焦点参数，避免刷新/返回时重复高亮
      if (typeof route.query.focus === 'string') {
        const query = { ...route.query };
        delete query.focus;
        void router.replace({ query });
      }
    }, 3200);
  }

  watch(
    [() => route.query.focus, () => ready.value],
    () => {
      if (ready.value) void locate();
    },
    { immediate: true },
  );

  onUnmounted(() => {
    if (highlightTimer != null) window.clearTimeout(highlightTimer);
  });

  return { focusId };
}
