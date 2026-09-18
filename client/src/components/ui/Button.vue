<template>
  <button
    :type="type"
    :disabled="disabled"
    :class="[baseClass, variantClass, sizeClass, class_]"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';

type ButtonVariant =
  | 'default'
  | 'outline'
  | 'destructive'
  | 'ghost'
  | 'secondary'
  | 'link';
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant;
    size?: ButtonSize;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    class?: string;
  }>(),
  {
    variant: 'default',
    size: 'default',
    type: 'button',
    disabled: false,
    class: '',
  },
);

// Rename to avoid conflict with reserved `class` prop
const class_ = computed(() => props.class);

const baseClass =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8A3D] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';

const variantClass = computed(() => {
  const variantMap: Record<ButtonVariant, string> = {
    default: 'bg-[#FF8A3D] text-white hover:bg-[#FF7A1D] shadow-md hover:shadow-lg',
    outline:
      'border border-orange-200 bg-white text-[#1F2329] hover:bg-orange-50 hover:text-[#FF8A3D]',
    destructive: 'bg-[#FF4D4F] text-white hover:bg-red-600',
    ghost: 'text-[#1F2329] hover:bg-orange-50 hover:text-[#FF8A3D]',
    secondary: 'bg-orange-100 text-[#FF8A3D] hover:bg-orange-200',
    link: 'text-[#FF8A3D] underline-offset-4 hover:underline',
  };
  return variantMap[props.variant];
});

const sizeClass = computed(() => {
  const sizeMap: Record<ButtonSize, string> = {
    default: 'min-h-10 px-5 py-2 text-sm',
    sm: 'min-h-8 px-3 py-1 text-xs',
    lg: 'min-h-12 px-6 py-3 text-base',
    icon: 'min-h-10 w-10',
  };
  return sizeMap[props.size];
});
</script>
