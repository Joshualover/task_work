<template>
  <textarea
    :id="id"
    :value="modelValue"
    :placeholder="placeholder"
    :rows="rows"
    class="flex w-full rounded-xl border border-orange-200 bg-white px-3 py-2 text-sm text-[#1F2329] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF8A3D] focus:ring-offset-1 resize-y min-h-[80px]"
    @input="onInput"
    @paste="onPaste"
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
  paste: [event: ClipboardEvent];
}>();

function onInput(e: Event): void {
  const target = e.target as HTMLTextAreaElement;
  emit('update:modelValue', target.value);
}

// 显式转发 paste：Vue 3 中单根组件上的 @paste 不会自动落到内部 textarea，
// 不转发的话父组件写的 @paste 永远不会触发。
function onPaste(e: ClipboardEvent): void {
  emit('paste', e);
}
</script>
