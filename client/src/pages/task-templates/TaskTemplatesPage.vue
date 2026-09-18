<template>
  <div class="min-h-full bg-[#FFF7E6] p-4 sm:p-6">
    <!-- Header -->
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-[#1F2329]">必要任务配置</h1>
        <p class="mt-1 text-sm text-gray-500">配置每日固定任务模板与积分规则</p>
      </div>
      <Button
        size="lg"
        @click="handleOpenCreate"
        class="rounded-full bg-[#FF8A3D] hover:bg-[#FF7A1F] text-white shadow-md"
      >
        <Plus class="h-5 w-5" />
        添加模板
      </Button>
    </div>

    <!-- Template List -->
    <div
      v-if="loading"
      class="rounded-2xl bg-white p-8 text-center text-gray-400 shadow-md"
    >
      加载中...
    </div>

    <div
      v-else-if="templates.length === 0"
      class="rounded-2xl bg-white p-12 text-center shadow-md"
    >
      <Star class="mx-auto h-12 w-12 text-orange-200" />
      <p class="mt-3 text-gray-400">还没有任务模板，点击右上角添加</p>
    </div>

    <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="template in templates"
        :key="template.id"
        :class="[
          'relative rounded-2xl bg-white p-4 shadow-md transition-shadow hover:shadow-lg',
          !template.isActive ? 'opacity-60' : '',
        ]"
      >
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-2">
            <GripVertical class="h-4 w-4 text-gray-300" />
            <h3 class="text-base font-semibold text-[#1F2329]">
              {{ template.name }}
            </h3>
          </div>
          <div class="flex items-center gap-1">
            <button
              type="button"
              @click="handleOpenEdit(template)"
              class="rounded-full p-1.5 text-gray-400 hover:bg-orange-50 hover:text-[#FF8A3D]"
            >
              <Pencil class="h-4 w-4" />
            </button>
            <button
              type="button"
              @click="handleDeleteClick(template.id)"
              class="rounded-full p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
            >
              <Trash2 class="h-4 w-4" />
            </button>
          </div>
        </div>

        <div class="mt-3 flex items-center gap-2 flex-wrap">
          <Badge
            variant="default"
            class="rounded-full bg-orange-100 text-[#FF8A3D] border-transparent"
          >
            {{ template.defaultPoints }} 积分
          </Badge>
          <Badge
            v-if="template.isDaily"
            variant="outline"
            class="rounded-full border-blue-200 text-[#36BFFA]"
          >
            {{ getFrequencyLabel(template) }}
          </Badge>
          <Badge
            v-else
            variant="outline"
            class="rounded-full border-gray-200 text-gray-500"
          >
            一次性
          </Badge>
        </div>

        <div class="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
          <span class="text-xs text-gray-400">
            排序：{{ template.sortOrder }}
          </span>
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-500">
              {{ template.isActive ? '已启用' : '已停用' }}
            </span>
            <Switch
              :checked="template.isActive"
              @update:checked="void handleToggleActive(template)"
              class="data-[state=checked]:bg-[#52C41A]"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Create/Edit Dialog -->
    <Dialog
      v-model:modelValue="dialogOpen"
      :title="editingTemplate ? '编辑任务模板' : '添加任务模板'"
      max-width-class="sm:max-w-md"
    >
      <div class="space-y-4 py-2">
        <div class="space-y-2">
          <Label for="name" class="text-sm font-medium text-[#1F2329]">
            任务名称
          </Label>
          <Input
            id="name"
            v-model:value="formData.name"
            placeholder="如：早起刷牙、阅读30分钟"
            class="rounded-xl"
          />
        </div>

        <div class="space-y-2">
          <Label for="points" class="text-sm font-medium text-[#1F2329]">
            默认积分
          </Label>
          <Input
            id="points"
            type="number"
            :value="String(formData.defaultPoints)"
            @update:value="handlePointsChange"
            class="rounded-xl"
          />
        </div>

        <!-- Frequency Selection -->
        <div class="space-y-3">
          <Label class="text-sm font-medium text-[#1F2329]">
            任务频率
          </Label>
          <div
            class="inline-flex rounded-full bg-gray-100 p-1"
            role="radiogroup"
          >
            <button
              v-for="opt in frequencyOptions"
              :key="opt.value"
              type="button"
              @click="handleFrequencyChange(opt.value)"
              :class="[
                'px-4 py-1.5 text-sm rounded-full transition-colors',
                formData.frequency === opt.value
                  ? 'bg-[#FF8A3D] text-white shadow-sm'
                  : 'text-gray-500 hover:text-[#FF8A3D]',
              ]"
            >
              {{ opt.label }}
            </button>
          </div>

          <!-- Weekly: weekday picker -->
          <div
            v-if="formData.frequency === 'weekly'"
            class="flex items-center justify-between gap-1 pt-1"
          >
            <button
              v-for="day in weekDayOptions"
              :key="day.value"
              type="button"
              @click="toggleWeekDay(day.value)"
              :class="[
                'h-9 w-9 rounded-full text-sm font-medium transition-all border',
                formData.weekDays.includes(day.value)
                  ? 'bg-[#FF8A3D] text-white border-[#FF8A3D]'
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-orange-50 hover:border-orange-200',
              ]"
            >
              {{ day.label }}
            </button>
          </div>

          <!-- Monthly: day picker -->
          <div
            v-if="formData.frequency === 'monthly'"
            class="grid grid-cols-7 gap-2 pt-1"
          >
            <button
              v-for="day in monthDayOptions"
              :key="day"
              type="button"
              @click="toggleMonthDay(day)"
              :class="[
                'h-9 rounded-xl text-sm font-medium transition-all border',
                formData.monthDays.includes(day)
                  ? 'bg-[#FF8A3D] text-white border-[#FF8A3D]'
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-orange-50 hover:border-orange-200',
              ]"
            >
              {{ day }}
            </button>
          </div>
        </div>

        <div class="space-y-2">
          <Label for="sortOrder" class="text-sm font-medium text-[#1F2329]">
            排序（数字越小越靠前）
          </Label>
          <Input
            id="sortOrder"
            type="number"
            :value="String(formData.sortOrder)"
            @update:value="handleSortOrderChange"
            class="rounded-xl"
          />
        </div>
      </div>

      <template #footer>
        <Button
          variant="outline"
          @click="dialogOpen = false"
          class="rounded-full"
        >
          取消
        </Button>
        <Button
          @click="void handleSubmit()"
          class="rounded-full bg-[#FF8A3D] hover:bg-[#FF7A1F] text-white"
          :disabled="!formData.name.trim() || !isFrequencyValid()"
        >
          {{ editingTemplate ? '保存修改' : '添加模板' }}
        </Button>
      </template>
    </Dialog>

    <!-- Delete Confirmation Dialog -->
    <Dialog
      v-model:modelValue="deleteConfirmOpen"
      title="确认删除"
      max-width-class="sm:max-w-sm"
    >
      <p class="text-sm text-gray-500">
        删除后无法恢复，已生成的任务实例不受影响。确定要删除这个任务模板吗？
      </p>
      <template #footer>
        <Button
          variant="outline"
          @click="deleteConfirmOpen = false"
          class="rounded-full"
        >
          取消
        </Button>
        <Button
          variant="destructive"
          @click="void handleDeleteConfirm()"
          class="rounded-full bg-[#FF4D4F] hover:bg-[#FF3333] text-white"
        >
          确认删除
        </Button>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { Plus, Pencil, Trash2, Star, GripVertical } from 'lucide-vue-next';

import { taskApi, familyApi } from '@/api';
import Button from '@/components/ui/Button.vue';
import Dialog from '@/components/ui/Dialog.vue';
import Input from '@/components/ui/Input.vue';
import Label from '@/components/ui/Label.vue';
import Switch from '@/components/ui/Switch.vue';
import Badge from '@/components/ui/Badge.vue';
import type {
  TaskTemplate,
  CreateTaskTemplateRequest,
  UpdateTaskTemplateRequest,
} from '@shared/api.interface';

type Frequency = 'daily' | 'weekly' | 'monthly';

interface FormData {
  name: string;
  defaultPoints: number;
  isDaily: boolean;
  frequency: Frequency;
  weekDays: number[];
  monthDays: number[];
  sortOrder: number;
}

const frequencyOptions: Array<{ value: Frequency; label: string }> = [
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
];

// 0=周日, 1=周一, ..., 6=周六
const weekDayOptions: Array<{ value: number; label: string }> = [
  { value: 0, label: '日' },
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
];

const monthDayOptions: number[] = Array.from({ length: 31 }, (_, i) => i + 1);

const templates = ref<TaskTemplate[]>([]);
const loading = ref<boolean>(false);
const familyId = ref<string>('');
const dialogOpen = ref<boolean>(false);
const editingTemplate = ref<TaskTemplate | null>(null);
const formData = ref<FormData>({
  name: '',
  defaultPoints: 10,
  isDaily: true,
  frequency: 'daily',
  weekDays: [],
  monthDays: [],
  sortOrder: 0,
});
const deleteConfirmOpen = ref<boolean>(false);
const deleteTargetId = ref<string | null>(null);

async function fetchTemplates(): Promise<void> {
  if (!familyId.value) return;
  loading.value = true;
  try {
    const result = await taskApi.listTemplates(familyId.value);
    templates.value = result.items;
  } catch (error) {
    logger.error('获取任务模板列表失败', error);
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  try {
    const result = await familyApi.getFamily();
    familyId.value = result.family.id;
    void fetchTemplates();
  } catch (error) {
    logger.error('获取家庭信息失败', error);
  }
});

function getFrequencyLabel(template: TaskTemplate): string {
  if (!template.isDaily) return '一次性';
  const freq = template.frequency ?? 'daily';
  if (freq === 'daily') return '每天';
  if (freq === 'weekly') {
    if (!template.weekDays || template.weekDays.length === 0) return '每周';
    const labels = template.weekDays
      .slice()
      .sort((a: number, b: number) => a - b)
      .map((d: number) => weekDayOptions.find((w) => w.value === d)?.label ?? String(d))
      .join('、');
    return `每周 ${labels}`;
  }
  if (freq === 'monthly') {
    if (!template.monthDays || template.monthDays.length === 0) return '每月';
    const labels = template.monthDays
      .slice()
      .sort((a: number, b: number) => a - b)
      .map((d: number) => `${d}号`)
      .join('、');
    return `每月 ${labels}`;
  }
  return '每天';
}

function handleOpenCreate(): void {
  editingTemplate.value = null;
  formData.value = {
    name: '',
    defaultPoints: 10,
    isDaily: true,
    frequency: 'daily',
    weekDays: [],
    monthDays: [],
    sortOrder: templates.value.length,
  };
  dialogOpen.value = true;
}

function handleOpenEdit(template: TaskTemplate): void {
  editingTemplate.value = template;
  formData.value = {
    name: template.name,
    defaultPoints: template.defaultPoints,
    isDaily: true,
    frequency: template.frequency ?? 'daily',
    weekDays: template.weekDays ? [...template.weekDays] : [],
    monthDays: template.monthDays ? [...template.monthDays] : [],
    sortOrder: template.sortOrder,
  };
  dialogOpen.value = true;
}

function handlePointsChange(val: string): void {
  formData.value.defaultPoints = Number(val) || 0;
}

function handleSortOrderChange(val: string): void {
  formData.value.sortOrder = Number(val) || 0;
}

function handleFrequencyChange(freq: Frequency): void {
  formData.value.frequency = freq;
  if (freq !== 'weekly') {
    formData.value.weekDays = [];
  }
  if (freq !== 'monthly') {
    formData.value.monthDays = [];
  }
}

function toggleWeekDay(day: number): void {
  const idx = formData.value.weekDays.indexOf(day);
  if (idx === -1) {
    formData.value.weekDays = [...formData.value.weekDays, day];
  } else {
    formData.value.weekDays = formData.value.weekDays.filter((d: number) => d !== day);
  }
}

function toggleMonthDay(day: number): void {
  const idx = formData.value.monthDays.indexOf(day);
  if (idx === -1) {
    formData.value.monthDays = [...formData.value.monthDays, day];
  } else {
    formData.value.monthDays = formData.value.monthDays.filter((d: number) => d !== day);
  }
}

function isFrequencyValid(): boolean {
  if (formData.value.frequency === 'daily') return true;
  if (formData.value.frequency === 'weekly') return formData.value.weekDays.length > 0;
  if (formData.value.frequency === 'monthly') return formData.value.monthDays.length > 0;
  return true;
}

async function handleSubmit(): Promise<void> {
  if (!formData.value.name.trim()) return;
  if (!isFrequencyValid()) return;

  try {
    if (editingTemplate.value) {
      const updateData: UpdateTaskTemplateRequest = {
        name: formData.value.name,
        defaultPoints: formData.value.defaultPoints,
        isDaily: true,
        frequency: formData.value.frequency,
        weekDays: formData.value.weekDays,
        monthDays: formData.value.monthDays,
        sortOrder: formData.value.sortOrder,
      };
      await taskApi.updateTemplate(editingTemplate.value.id, updateData);
    } else {
      const createData: CreateTaskTemplateRequest & { familyId: string } = {
        name: formData.value.name,
        defaultPoints: formData.value.defaultPoints,
        isDaily: true,
        frequency: formData.value.frequency,
        weekDays: formData.value.weekDays,
        monthDays: formData.value.monthDays,
        sortOrder: formData.value.sortOrder,
        familyId: familyId.value,
      };
      await taskApi.createTemplate(createData);
    }
    dialogOpen.value = false;
    void fetchTemplates();
  } catch (error) {
    logger.error('保存任务模板失败', error);
  }
}

async function handleToggleActive(template: TaskTemplate): Promise<void> {
  try {
    await taskApi.updateTemplate(template.id, {
      isActive: !template.isActive,
    });
    void fetchTemplates();
  } catch (error) {
    logger.error('切换模板状态失败', error);
  }
}

function handleDeleteClick(id: string): void {
  deleteTargetId.value = id;
  deleteConfirmOpen.value = true;
}

async function handleDeleteConfirm(): Promise<void> {
  if (!deleteTargetId.value) return;
  try {
    await taskApi.deleteTemplate(deleteTargetId.value);
    deleteConfirmOpen.value = false;
    deleteTargetId.value = null;
    void fetchTemplates();
  } catch (error) {
    logger.error('删除任务模板失败', error);
  }
}
</script>
