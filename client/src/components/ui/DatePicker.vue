<template>
  <div class="relative w-full" ref="containerRef">
    <!-- Input -->
    <div
      class="flex h-10 w-full items-center rounded-xl border border-orange-200 bg-white px-3 text-sm text-[#1F2329] focus-within:ring-2 focus-within:ring-[#FF8A3D] focus-within:ring-offset-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
      :class="{ 'opacity-50 cursor-not-allowed': disabled }"
      @click="!disabled && (panelOpen = !panelOpen)"
    >
      <Calendar class="h-4 w-4 text-gray-400 mr-2" />
      <span v-if="modelValue" class="flex-1 text-[#1F2329]">{{ modelValue }}</span>
      <span v-else class="flex-1 text-gray-400">{{ placeholder }}</span>
      <ChevronDown v-if="modelValue && !disabled" class="h-4 w-4 text-gray-400" />
    </div>

    <!-- Calendar Panel -->
    <Teleport to="body">
      <div
        v-if="panelOpen"
        ref="panelRef"
        class="fixed z-50 w-[300px] rounded-xl bg-white p-3 shadow-lg border border-orange-100"
        :style="panelStyle"
      >
        <!-- Header: month navigation -->
        <div class="flex items-center justify-between mb-2">
          <button
            type="button"
            class="p-1 rounded-lg hover:bg-orange-50 transition-colors"
            @click.stop="prevMonth"
          >
            <ChevronLeft class="h-5 w-5 text-gray-600" />
          </button>
          <span class="text-sm font-semibold text-[#1F2329]">
            {{ viewYear }} 年 {{ viewMonth + 1 }} 月
          </span>
          <button
            type="button"
            class="p-1 rounded-lg hover:bg-orange-50 transition-colors"
            @click.stop="nextMonth"
          >
            <ChevronRight class="h-5 w-5 text-gray-600" />
          </button>
        </div>

        <!-- Weekday header -->
        <div class="grid grid-cols-7 gap-1 mb-1">
          <div
            v-for="day in weekDays"
            :key="day"
            class="h-8 flex items-center justify-center text-xs font-medium text-gray-500"
          >
            {{ day }}
          </div>
        </div>

        <!-- Date grid -->
        <div class="grid grid-cols-7 gap-1">
          <button
            v-for="(day, idx) in calendarDays"
            :key="idx"
            type="button"
            class="h-8 w-full rounded-lg text-sm transition-colors"
            :class="getDayClass(day)"
            @click.stop="selectDate(day)"
          >
            {{ day.date }}
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { Calendar, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-vue-next';

interface CalendarDay {
  year: number;
  month: number;
  date: number;
  isCurrentMonth: boolean;
  iso: string;
}

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    disabled?: boolean;
  }>(),
  {
    placeholder: '请选择日期',
    disabled: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const panelRef = ref<HTMLDivElement | null>(null);
const panelOpen = ref<boolean>(false);
const panelStyle = ref<Record<string, string>>({});

const today = new Date();
const todayStr = formatDate(today);

// Parse initial modelValue
const parsed = computed(() => {
  if (!props.modelValue) return { year: today.getFullYear(), month: today.getMonth() };
  const parts = props.modelValue.split('-');
  if (parts.length < 2) return { year: today.getFullYear(), month: today.getMonth() };
  return { year: Number(parts[0]), month: Number(parts[1]) - 1 };
});

const viewYear = ref<number>(parsed.value.year);
const viewMonth = ref<number>(parsed.value.month);

watch(
  () => props.modelValue,
  () => {
    if (panelOpen.value) {
      viewYear.value = parsed.value.year;
      viewMonth.value = parsed.value.month;
    }
  },
);

const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

const calendarDays = computed<CalendarDay[]>(() => {
  const days: CalendarDay[] = [];
  const firstDay = firstDayOfMonth(viewYear.value, viewMonth.value);
  const totalDays = daysInMonth(viewYear.value, viewMonth.value);
  const prevMonthDays = daysInMonth(viewYear.value, viewMonth.value - 1);

  // Previous month days
  for (let i = firstDay - 1; i >= 0; i -= 1) {
    const date = prevMonthDays - i;
    let y = viewYear.value;
    let m = viewMonth.value - 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    days.push({
      year: y,
      month: m,
      date,
      isCurrentMonth: false,
      iso: formatDate(new Date(y, m, date)),
    });
  }

  // Current month days
  for (let d = 1; d <= totalDays; d += 1) {
    days.push({
      year: viewYear.value,
      month: viewMonth.value,
      date: d,
      isCurrentMonth: true,
      iso: formatDate(new Date(viewYear.value, viewMonth.value, d)),
    });
  }

  // Next month days to fill 42 cells (6 rows)
  const remaining = 42 - days.length;
  for (let d = 1; d <= remaining; d += 1) {
    let y = viewYear.value;
    let m = viewMonth.value + 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    days.push({
      year: y,
      month: m,
      date: d,
      isCurrentMonth: false,
      iso: formatDate(new Date(y, m, d)),
    });
  }

  return days;
});

function getDayClass(day: CalendarDay): string {
  const classes: string[] = [];
  if (!day.isCurrentMonth) {
    classes.push('text-gray-300');
  } else {
    classes.push('text-[#1F2329]');
  }

  if (day.iso === props.modelValue) {
    classes.push('bg-[#FF8A3D] text-white font-medium hover:bg-[#FF7A1F]');
    return classes.join(' ');
  }

  if (day.iso === todayStr && day.isCurrentMonth) {
    classes.push('border border-[#FF8A3D] text-[#FF8A3D] font-medium hover:bg-orange-50');
  } else if (day.isCurrentMonth) {
    classes.push('hover:bg-orange-50');
  } else {
    classes.push('hover:bg-gray-50');
  }

  return classes.join(' ');
}

function selectDate(day: CalendarDay): void {
  emit('update:modelValue', day.iso);
  panelOpen.value = false;
}

function prevMonth(): void {
  if (viewMonth.value === 0) {
    viewMonth.value = 11;
    viewYear.value -= 1;
  } else {
    viewMonth.value -= 1;
  }
}

function nextMonth(): void {
  if (viewMonth.value === 11) {
    viewMonth.value = 0;
    viewYear.value += 1;
  } else {
    viewMonth.value += 1;
  }
}

function updatePanelPosition(): void {
  if (!containerRef.value || !panelOpen.value) return;
  const rect = containerRef.value.getBoundingClientRect();
  panelStyle.value = {
    top: `${rect.bottom + 4}px`,
    left: `${rect.left}px`,
  };
}

function handleClickOutside(e: MouseEvent): void {
  const target = e.target as Node;
  // Check if click is inside the input container
  if (containerRef.value && containerRef.value.contains(target)) return;
  // Check if click is inside the calendar panel (teleported to body)
  if (panelRef.value && panelRef.value.contains(target)) return;
  panelOpen.value = false;
}

watch(panelOpen, (open) => {
  if (open) {
    viewYear.value = parsed.value.year;
    viewMonth.value = parsed.value.month;
    updatePanelPosition();
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', updatePanelPosition);
  } else {
    document.removeEventListener('mousedown', handleClickOutside);
    window.removeEventListener('resize', updatePanelPosition);
  }
});

onMounted(() => {
  if (panelOpen.value) {
    document.addEventListener('mousedown', handleClickOutside);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside);
  window.removeEventListener('resize', updatePanelPosition);
});
</script>
