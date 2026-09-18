<template>
  <span :class="['inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', variantClass]">
    <slot />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

type BadgeVariant = 'default' | 'outline' | 'secondary' | 'destructive';

const props = withDefaults(
  defineProps<{
    variant?: BadgeVariant;
  }>(),
  {
    variant: 'default',
  },
);

const variantClass = computed(() => {
  const variantMap: Record<BadgeVariant, string> = {
    default: 'bg-[#FF8A3D] text-white',
    outline: 'border border-orange-200 text-[#FF8A3D] bg-white',
    secondary: 'bg-orange-100 text-[#FF8A3D]',
    destructive: 'bg-[#FF4D4F] text-white',
  };
  return variantMap[props.variant];
});
</script>
