<template>
  <textarea
    :id="id"
    :value="modelValue"
    :placeholder="placeholder"
    :rows="rows"
    class="flex w-full rounded-xl border border-orange-200 bg-white px-3 py-2 text-sm text-[#1F2329] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF8A3D] focus:ring-offset-1 resize-y min-h-[80px]"
    @input="onInput"
  />
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    rows?: number;
    id?: string;
  }>(),
  {
    placeholder: '',
    rows: 3,
    id: '',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

function onInput(e: Event): void {
  const target = e.target as HTMLTextAreaElement;
  emit('update:modelValue', target.value);
}
</script>
