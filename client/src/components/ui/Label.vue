<template>
  <label
    :for="for_"
    class="text-sm font-medium text-[#1F2329] leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
  >
    <slot />
  </label>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    for?: string;
  }>(),
  {
    for: '',
  },
);

const for_ = computed(() => props.for);
</script>
