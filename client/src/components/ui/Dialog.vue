<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-50 flex items-center justify-center"
    >
      <!-- Overlay -->
      <div
        class="absolute inset-0 bg-black/40 backdrop-blur-sm"
        @click="handleOverlayClick"
      />
      <!-- Content -->
      <div
        :class="[
          'relative z-10 w-full mx-4 bg-white rounded-2xl shadow-xl',
          maxWidthClass,
        ]"
      >
        <!-- Header -->
        <div
          v-if="title"
          class="flex items-center justify-between border-b border-orange-100 px-6 py-4"
        >
          <h3 class="text-lg font-semibold text-[#1F2329]">{{ title }}</h3>
          <button
            type="button"
            class="text-gray-400 hover:text-[#1F2329] transition-colors"
            @click="handleClose"
          >
            <X class="h-5 w-5" />
          </button>
        </div>
        <!-- Body -->
        <div class="px-6 py-4">
          <slot />
        </div>
        <!-- Footer -->
        <div
          v-if="$slots.footer"
          class="flex justify-end gap-2 border-t border-orange-100 px-6 py-4"
        >
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    title?: string;
    maxWidthClass?: string;
  }>(),
  {
    title: '',
    maxWidthClass: 'sm:max-w-md',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

function handleClose(): void {
  emit('update:modelValue', false);
}

function handleOverlayClick(): void {
  emit('update:modelValue', false);
}
</script>
