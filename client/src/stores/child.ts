import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { childApi } from '@/api';
import type { Child } from '@shared/api.interface';

export const useChildStore = defineStore('child', () => {
  const children = ref<Child[]>([]);
  const currentChildId = ref<string | null>(null);
  const loading = ref<boolean>(false);

  const currentChild = computed<Child | null>(() => {
    return children.value.find((c: Child) => c.id === currentChildId.value) ?? null;
  });

  async function fetchChildren(): Promise<void> {
    try {
      loading.value = true;
      const result = await childApi.list();
      children.value = result.items;
      if (result.items.length > 0 && !currentChildId.value) {
        currentChildId.value = result.items[0].id;
      }
    } finally {
      loading.value = false;
    }
  }

  function setCurrentChildId(id: string): void {
    currentChildId.value = id;
  }

  return {
    children,
    currentChildId,
    currentChild,
    loading,
    fetchChildren,
    setCurrentChildId,
  };
});
