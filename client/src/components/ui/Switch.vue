<template>
  <button
    type="button"
    role="switch"
    :aria-checked="checked"
    :id="id"
    :disabled="disabled"
    :class="[
      'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8A3D] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
      checked ? 'bg-[#FF8A3D]' : 'bg-gray-200',
      class_,
    ]"
    @click="handleClick"
  >
    <span
      :class="[
        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition-transform',
        checked ? 'translate-x-5' : 'translate-x-0',
      ]"
    />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    checked: boolean;
    id?: string;
    disabled?: boolean;
    class?: string;
  }>(),
  {
    id: '',
    disabled: false,
    class: '',
  },
);

const emit = defineEmits<{
  'update:checked': [value: boolean];
}>();

const class_ = computed(() => props.class);

function handleClick(): void {
  if (props.disabled) return;
  emit('update:checked', !props.checked);
}
</script>
