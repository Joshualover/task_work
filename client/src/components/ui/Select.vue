<template>
  <select
    :id="id"
    :value="modelValue"
    :disabled="disabled"
    class="flex h-10 w-full rounded-xl border border-orange-200 bg-white px-3 py-2 text-sm text-[#1F2329] focus:outline-none focus:ring-2 focus:ring-[#FF8A3D] focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 appearance-none bg-no-repeat bg-right pr-10"
    :style="selectStyle"
    @change="onChange"
  >
    <option v-if="placeholder" value="" disabled>
      {{ placeholder }}
    </option>
    <option v-for="opt in options" :key="opt.value" :value="opt.value">
      {{ opt.label }}
    </option>
  </select>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface SelectOption {
  value: string;
  label: string;
}

const selectStyle = computed(() => ({
  backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat',
  backgroundSize: '1.5em 1.5em',
}));

withDefaults(
  defineProps<{
    modelValue: string;
    options: SelectOption[];
    placeholder?: string;
    id?: string;
    disabled?: boolean;
  }>(),
  {
    placeholder: '',
    id: '',
    disabled: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

function onChange(e: Event): void {
  const target = e.target as HTMLSelectElement;
  emit('update:modelValue', target.value);
}
</script>
