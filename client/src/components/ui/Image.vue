<template>
  <div :class="['relative overflow-hidden bg-gray-100', containerClass]">
    <!-- Loading placeholder -->
    <div
      v-if="isLoading"
      class="absolute inset-0 flex items-center justify-center bg-gray-100"
    >
      <div class="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-orange-400" />
    </div>
    <!-- Error placeholder -->
    <div
      v-else-if="hasError"
      class="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 text-gray-400"
    >
      <ImageIcon class="h-8 w-8" />
      <span class="mt-1 text-xs">加载失败</span>
    </div>
    <!-- Actual image -->
    <img
      v-show="!isLoading && !hasError"
      :src="src"
      :alt="alt"
      :width="width"
      :height="height"
      :class="imgClass"
      @load="handleLoad"
      @error="handleError"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Image as ImageIcon } from 'lucide-vue-next';

const props = withDefaults(
  defineProps<{
    src: string;
    alt?: string;
    width?: number | string;
    height?: number | string;
    class?: string;
  }>(),
  {
    alt: '',
    width: undefined,
    height: undefined,
    class: '',
  },
);

const isLoading = ref<boolean>(true);
const hasError = ref<boolean>(false);

const containerClass = computed(() => props.class || '');
const imgClass = computed(() => {
  if (!props.class) return 'h-full w-full object-cover';
  return 'h-full w-full object-cover';
});

function handleLoad(): void {
  isLoading.value = false;
  hasError.value = false;
}

function handleError(): void {
  isLoading.value = false;
  hasError.value = true;
}
</script>
