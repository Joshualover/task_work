<template>
  <input
    :id="id"
    :type="type"
    :value="value"
    :placeholder="placeholder"
    :disabled="disabled"
    :class="[
      'flex h-10 w-full rounded-xl border border-orange-200 bg-white px-3 py-2 text-sm text-[#1F2329] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF8A3D] focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
      class_,
    ]"
    @input="onInput"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    value: string;
    placeholder?: string;
    type?: string;
    id?: string;
    disabled?: boolean;
    class?: string;
  }>(),
  {
    placeholder: '',
    type: 'text',
    id: '',
    disabled: false,
    class: '',
  },
);

const emit = defineEmits<{
  'update:value': [value: string];
}>();

const class_ = computed(() => props.class);

function onInput(e: Event): void {
  const target = e.target as HTMLInputElement;
  emit('update:value', target.value);
}
</script>
