<template>
  <Dialog v-model:modelValue="localOpen" :title="title" max-width-class="sm:max-w-sm">
    <p class="text-sm text-gray-600">{{ message }}</p>
    <template #footer>
      <Button
        variant="outline"
        @click="handleCancel"
        class="rounded-full"
      >
        {{ cancelText }}
      </Button>
      <Button
        @click="handleConfirm"
        class="rounded-full bg-[#FF8A3D] hover:bg-[#FF7A2D] text-white"
      >
        {{ confirmText }}
      </Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import Dialog from './Dialog.vue';
import Button from './Button.vue';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
  }>(),
  {
    confirmText: '确定',
    cancelText: '取消',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  confirm: [];
  cancel: [];
}>();

const localOpen = ref<boolean>(props.modelValue);

watch(
  () => props.modelValue,
  (val: boolean) => {
    localOpen.value = val;
  },
);

function handleConfirm(): void {
  emit('confirm');
  emit('update:modelValue', false);
  localOpen.value = false;
}

function handleCancel(): void {
  emit('cancel');
  emit('update:modelValue', false);
  localOpen.value = false;
}
</script>
