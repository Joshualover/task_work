<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { logger } from '@lark-apaas/client-toolkit/logger';
import {
  Plus, Clock, CheckCircle, XCircle, AlertCircle, BookOpen, Star,
  Trash2, Sparkles, Upload, FileText, X, Image as ImageIcon,
  ChevronDown, ChevronUp, Edit3, CheckCircle2, Circle,
} from 'lucide-vue-next';
import Button from '@/components/ui/Button.vue';
import Dialog from '@/components/ui/Dialog.vue';
import Input from '@/components/ui/Input.vue';
import Label from '@/components/ui/Label.vue';
import Badge from '@/components/ui/Badge.vue';
import Textarea from '@/components/ui/Textarea.vue';
import Select from '@/components/ui/Select.vue';
import DatePicker from '@/components/ui/DatePicker.vue';
import Switch from '@/components/ui/Switch.vue';
import { taskApi, aiApi } from '@/api';
import { useChildStore } from '@/stores/child';
import { todayString } from '@/utils/date';
import { toast } from '@/components/ui/toast';
import type {
  TaskInstance,
  TaskStatus,
  CreateHomeworkTaskRequest,
  HomeworkSuggestion,
  HomeworkSubtask,
} from '@shared/api.interface';

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: '待完成',
  submitted: '待确认',
  completed: '已完成',
  overdue: '已逾期',
  rejected: '已驳回',
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  pending: 'bg-gray-100 text-gray-600 border-transparent',
  submitted: 'bg-orange-100 text-[#FF8A3D] border-transparent',
  completed: 'bg-green-100 text-[#52C41A] border-transparent',
  overdue: 'bg-red-100 text-[#FF4D4F] border-transparent',
  rejected: 'bg-red-100 text-[#FF4D4F] border-transparent',
};

const SUBJECT_OPTIONS = [
  { value: '语文', label: '语文' },
  { value: '数学', label: '数学' },
  { value: '英语', label: '英语' },
  { value: '科学', label: '科学' },
  { value: '阅读', label: '阅读' },
  { value: '其他', label: '其他' },
];

interface FormData {
  name: string;
  subject: string;
  points: number;
  deadline: string;
  taskDate: string;
  /** 遇周末/节假日顺延 */
  extendHoliday: boolean;
  /** 顺延天数 */
  extendDays: number;
}

interface SubtaskFormItem {
  content: string;
}

const childStore = useChildStore();
const currentChildId = computed(() => childStore.currentChildId);
const childLoading = computed(() => childStore.loading);

const tasks = ref<TaskInstance[]>([]);
const loading = ref<boolean>(false);
const dialogOpen = ref<boolean>(false);
const formData = reactive<FormData>({
  name: '',
  subject: '语文',
  points: 10,
  deadline: '',
  taskDate: '',
  extendHoliday: false,
  extendDays: 2,
});
const formSubtasks = reactive<SubtaskFormItem[]>([]);
const isEditMode = ref<boolean>(false);
const editingSuggestionId = ref<string>('');
const reviewTaskId = ref<string | null>(null);
const rejectReason = ref<string>('');

// Delete confirmation
const deleteTaskId = ref<string | null>(null);

// AI import dialog
const aiDialogOpen = ref<boolean>(false);
const aiTab = ref<'image' | 'text'>('text');
const aiTextContent = ref<string>('');
const aiRecognizing = ref<boolean>(false);
const aiSuggestions = ref<HomeworkSuggestion[]>([]);
const selectedSuggestionIds = ref<string[]>([]);
const aiConfirming = ref<boolean>(false);

// Image upload
const uploadedImages = ref<File[]>([]);
const imagePreviews = ref<string[]>([]);

// Task card expansion state (for subtasks)
const expandedTaskIds = ref<Set<string>>(new Set());

// 任务分类筛选（单项 / 多项）与子任务打卡中状态
const taskCategory = ref<'all' | 'single' | 'multi'>('all');
const togglingSubtaskIds = ref<Set<string>>(new Set());

const toggleTaskExpand = (taskId: string): void => {
  if (expandedTaskIds.value.has(taskId)) {
    expandedTaskIds.value.delete(taskId);
  } else {
    expandedTaskIds.value.add(taskId);
  }
};

// AI suggestion expansion state (for subtasks)
const expandedSuggestionIds = ref<Set<string>>(new Set());

const toggleSuggestionExpand = (suggestionId: string): void => {
  if (expandedSuggestionIds.value.has(suggestionId)) {
    expandedSuggestionIds.value.delete(suggestionId);
  } else {
    expandedSuggestionIds.value.add(suggestionId);
  }
};

// Subtask form helpers（子任务不计积分，仅作为完成检查项）
const hasSubtasks = computed<boolean>(() => formSubtasks.length > 0);

const addSubtask = (): void => {
  formSubtasks.push({ content: '' });
};

const removeSubtask = (index: number): void => {
  formSubtasks.splice(index, 1);
};

const getTaskSubtasks = (task: TaskInstance): HomeworkSubtask[] => {
  return (task as TaskInstance & { subtasks?: HomeworkSubtask[] }).subtasks ?? [];
};

const hasTaskSubtasks = (task: TaskInstance): boolean => {
  return getTaskSubtasks(task).length > 0;
};

const getCompletedSubtaskCount = (task: TaskInstance): number => {
  return getTaskSubtasks(task).filter((st: HomeworkSubtask) => st.isCompleted).length;
};

const today = computed<string>(() => todayString());

/** 作业的实际可完成截止日 = 截止日 + 顺延天数 */
const effectiveDeadline = (task: TaskInstance): string | null => {
  if (!task.deadline) return null;
  const days = task.extendDays ?? 0;
  if (days <= 0) return task.deadline;
  const d = new Date(`${task.deadline}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** 截止日是否为周五（提示可顺延到周日） */
const deadlineIsFriday = computed<boolean>(() => {
  if (!formData.deadline) return false;
  return new Date(`${formData.deadline}T00:00:00`).getDay() === 5;
});

/** 弹窗内预览顺延后的截止日 */
const effectiveDeadlinePreview = computed<string | null>(() => {
  if (!formData.deadline || !formData.extendHoliday) return null;
  const days = Math.max(0, Math.floor(Number(formData.extendDays) || 0));
  if (days <= 0) return null;
  const d = new Date(`${formData.deadline}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});

function applyWeekendExtend(): void {
  formData.extendHoliday = true;
  formData.extendDays = 2;
}

const fetchTasks = async (): Promise<void> => {
  if (!currentChildId.value) return;
  loading.value = true;
  try {
    const result = await taskApi.listTasks({
      childId: currentChildId.value,
      date: today.value,
    });
    tasks.value = result.items;
  } catch (error) {
    logger.error('获取任务列表失败', error);
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  formData.taskDate = today.value;
  void fetchTasks();
});

watch([currentChildId, today], () => {
  void fetchTasks();
});

const visibleTasks = computed<TaskInstance[]>(() => {
  if (taskCategory.value === 'single') {
    return tasks.value.filter((t: TaskInstance) => !hasTaskSubtasks(t));
  }
  if (taskCategory.value === 'multi') {
    return tasks.value.filter((t: TaskInstance) => hasTaskSubtasks(t));
  }
  return tasks.value;
});

const taskCategoryOptions = computed(() => [
  { value: 'all' as const, label: '全部任务', count: tasks.value.length },
  {
    value: 'single' as const,
    label: '单项任务',
    count: tasks.value.filter((t: TaskInstance) => !hasTaskSubtasks(t)).length,
  },
  {
    value: 'multi' as const,
    label: '多项任务',
    count: tasks.value.filter((t: TaskInstance) => hasTaskSubtasks(t)).length,
  },
]);

const groupedTasks = computed<Record<TaskStatus, TaskInstance[]>>(() => {
  const groups: Record<TaskStatus, TaskInstance[]> = {
    pending: [],
    submitted: [],
    completed: [],
    overdue: [],
    rejected: [],
  };
  for (const task of visibleTasks.value) {
    groups[task.status].push(task);
  }
  return groups;
});

// 勾选 / 取消子任务；全部完成后后端会自动完成任务
const handleToggleSubtask = async (task: TaskInstance, subtask: HomeworkSubtask): Promise<void> => {
  if (!task.suggestionId || !currentChildId.value) return;
  if (togglingSubtaskIds.value.has(subtask.id)) return;
  const next = new Set(togglingSubtaskIds.value);
  next.add(subtask.id);
  togglingSubtaskIds.value = next;
  try {
    await aiApi.toggleSubtask(task.suggestionId, subtask.id, {
      childId: currentChildId.value,
      isCompleted: !subtask.isCompleted,
    });
    await fetchTasks();
  } catch (error) {
    logger.error('更新子任务失败', error);
    toast.error('更新子任务失败，请重试');
  } finally {
    const after = new Set(togglingSubtaskIds.value);
    after.delete(subtask.id);
    togglingSubtaskIds.value = after;
  }
};

const handleCreateHomework = async (): Promise<void> => {
  if (!formData.name.trim() || !currentChildId.value) return;

  // 顺延天数（启用顺延才有值）
  const extendDays = formData.extendHoliday
    ? Math.max(0, Math.floor(Number(formData.extendDays) || 0))
    : 0;

  // Filter out empty subtask rows
  const validSubtasks = formSubtasks.filter((st: SubtaskFormItem) => st.content.trim() !== '');

  try {
    if (isEditMode.value && editingSuggestionId.value) {
      // Edit existing suggestion
      const subtasksPayload = validSubtasks.map((st: SubtaskFormItem, idx: number) => ({
        content: st.content.trim(),
        sortOrder: idx,
      }));
      await aiApi.updateSuggestion(
        editingSuggestionId.value,
        currentChildId.value,
        {
          subject: formData.subject,
          content: formData.name,
          suggestedPoints: formData.points,
          deadline: formData.deadline || undefined,
          extendDays,
          subtasks: validSubtasks.length > 0 ? subtasksPayload : [],
        },
      );
      toast.success('作业任务修改成功');
    } else if (validSubtasks.length > 0) {
      // Use suggestion API for tasks with subtasks
      const subtasksPayload = validSubtasks.map((st: SubtaskFormItem, idx: number) => ({
        content: st.content.trim(),
        sortOrder: idx,
      }));
      const result = await aiApi.createSuggestion({
        childId: currentChildId.value,
        subject: formData.subject,
        content: formData.name,
        suggestedPoints: formData.points,
        deadline: formData.deadline || undefined,
        extendDays,
        subtasks: subtasksPayload,
      });
      // Auto-confirm the suggestion so it appears in the task pool
      await aiApi.confirmSuggestions({
        suggestionIds: [result.suggestion.id],
        childId: currentChildId.value,
      });
    } else {
      // Regular task without subtasks
      const data: CreateHomeworkTaskRequest = {
        childId: currentChildId.value,
        name: formData.name,
        subject: formData.subject,
        points: formData.points,
        deadline: formData.deadline || undefined,
        extendDays,
        taskDate: formData.taskDate || today.value,
      };
      await taskApi.createHomeworkTask(data);
    }
    toast.success(isEditMode.value ? '作业任务修改成功' : '作业任务添加成功');
    dialogOpen.value = false;
    resetForm();
    void fetchTasks();
  } catch (error) {
    logger.error(isEditMode.value ? '修改作业任务失败' : '创建作业任务失败', error);
    toast.error(isEditMode.value ? '修改失败，请重试' : '添加失败，请重试');
  }
};

const resetForm = (): void => {
  formData.name = '';
  formData.subject = '语文';
  formData.points = 10;
  formData.deadline = '';
  formData.taskDate = today.value;
  formData.extendHoliday = false;
  formData.extendDays = 2;
  formSubtasks.splice(0, formSubtasks.length);
  isEditMode.value = false;
  editingSuggestionId.value = '';
};

const openCreateDialog = (): void => {
  resetForm();
  dialogOpen.value = true;
};

const openEditTask = (task: TaskInstance): void => {
  const subtasks = getTaskSubtasks(task);
  formData.name = task.name;
  formData.subject = task.subject ?? '语文';
  formData.points = task.points;
  formData.deadline = task.deadline ?? '';
  formData.extendHoliday = (task.extendDays ?? 0) > 0;
  formData.extendDays = (task.extendDays ?? 0) > 0 ? task.extendDays : 2;
  formData.taskDate = task.taskDate;
  formSubtasks.splice(
    0,
    formSubtasks.length,
    ...subtasks.map((st: HomeworkSubtask) => ({
      content: st.content,
    })),
  );
  // 优先用任务实例上的 suggestionId（AI 导入确认后会有），否则回退到 task.id
  editingSuggestionId.value = task.suggestionId ?? task.id;
  isEditMode.value = true;
  dialogOpen.value = true;
};

const openDeleteConfirm = (taskId: string): void => {
  deleteTaskId.value = taskId;
};

const closeDeleteConfirm = (): void => {
  deleteTaskId.value = null;
};

const handleDeleteTask = async (): Promise<void> => {
  if (!deleteTaskId.value) return;
  try {
    await taskApi.deleteTask(deleteTaskId.value);
    toast.success('删除成功');
    closeDeleteConfirm();
    void fetchTasks();
  } catch (error) {
    logger.error('删除任务失败', error);
    toast.error('删除失败，请重试');
  }
};

const handleDeleteDialogOpenChange = (open: boolean): void => {
  if (!open) closeDeleteConfirm();
};

const handleApprove = async (taskId: string): Promise<void> => {
  try {
    await taskApi.reviewTask(taskId, { approved: true });
    toast.success('已通过');
    reviewTaskId.value = null;
    rejectReason.value = '';
    void fetchTasks();
  } catch (error) {
    logger.error('审核通过失败', error);
    toast.error('操作失败，请重试');
  }
};

const handleReject = async (taskId: string): Promise<void> => {
  try {
    await taskApi.reviewTask(taskId, {
      approved: false,
      rejectReason: rejectReason.value || undefined,
    });
    toast.success('已驳回');
    reviewTaskId.value = null;
    rejectReason.value = '';
    void fetchTasks();
  } catch (error) {
    logger.error('审核驳回失败', error);
    toast.error('操作失败，请重试');
  }
};

const handleSubmitTask = async (taskId: string): Promise<void> => {
  try {
    await taskApi.submitTask(taskId, {});
    toast.success('已提交');
    void fetchTasks();
  } catch (error) {
    logger.error('提交任务失败', error);
    toast.error('提交失败，请重试');
  }
};

const handleGenerateDaily = async (): Promise<void> => {
  if (!currentChildId.value) return;
  try {
    await taskApi.generateDailyTasks(currentChildId.value, today.value);
    toast.success('每日任务已生成');
    void fetchTasks();
  } catch (error) {
    logger.error('生成每日任务失败', error);
    toast.error('生成失败，请重试');
  }
};

const openRejectDialog = (taskId: string) => {
  reviewTaskId.value = taskId;
  rejectReason.value = '';
};

const closeRejectDialog = () => {
  reviewTaskId.value = null;
  rejectReason.value = '';
};

const handleRejectDialogOpenChange = (open: boolean) => {
  if (!open) closeRejectDialog();
};

// ==================== AI 智能导入 ====================

const openAiDialog = (): void => {
  aiDialogOpen.value = true;
  aiTab.value = 'text';
  aiTextContent.value = '';
  aiSuggestions.value = [];
  selectedSuggestionIds.value = [];
  uploadedImages.value = [];
  imagePreviews.value = [];
  expandedSuggestionIds.value.clear();
};

const handleRecognizeByText = async (): Promise<void> => {
  if (!aiTextContent.value.trim() || !currentChildId.value) return;
  aiRecognizing.value = true;
  aiSuggestions.value = [];
  selectedSuggestionIds.value = [];
  try {
    const result = await aiApi.recognizeByText({
      childId: currentChildId.value,
      content: aiTextContent.value,
    });
    aiSuggestions.value = result.suggestions;
    selectedSuggestionIds.value = result.suggestions.map((s: HomeworkSuggestion) => s.id);
    if (result.notConfigured) {
      toast.info('当前为示例数据，请到「任务配置」→「AI服务设置」中配置自己的 API 以获得真实识别结果');
    } else if (result.suggestions.length === 0) {
      toast.info('未识别到作业内容，请检查输入');
    }
  } catch (error: any) {
    logger.error('AI 识别失败', error);
    const msg = error?.response?.data?.message || error?.message || '识别失败，请重试';
    toast.error(msg);
  } finally {
    aiRecognizing.value = false;
  }
};

const handleRecognizeByImage = async (): Promise<void> => {
  if (imagePreviews.value.length === 0 || !currentChildId.value) return;
  aiRecognizing.value = true;
  aiSuggestions.value = [];
  selectedSuggestionIds.value = [];
  try {
    const imageUrls = imagePreviews.value;
    const result = await aiApi.recognizeByImage({
      childId: currentChildId.value,
      imageUrls,
    });
    aiSuggestions.value = result.suggestions;
    selectedSuggestionIds.value = result.suggestions.map((s: HomeworkSuggestion) => s.id);
    if (result.notConfigured) {
      toast.info('当前为示例数据，请到「任务配置」→「AI服务设置」中配置图片识别模型以获得真实识别结果');
    } else if (result.suggestions.length === 0) {
      toast.info('未识别到作业内容，请检查图片');
    }
  } catch (error: any) {
    logger.error('AI 图片识别失败', error);
    const status = error?.response?.status;
    const msg =
      status === 413
        ? '图片太大了，请压缩后重试'
        : error?.response?.data?.message || error?.message || '识别失败，请重试';
    toast.error(msg);
  } finally {
    aiRecognizing.value = false;
  }
};

const toggleSuggestion = (id: string): void => {
  const idx = selectedSuggestionIds.value.indexOf(id);
  if (idx >= 0) {
    selectedSuggestionIds.value.splice(idx, 1);
  } else {
    selectedSuggestionIds.value.push(id);
  }
};

const updateSuggestionPoints = (id: string, val: string): void => {
  const s = aiSuggestions.value.find((item: HomeworkSuggestion) => item.id === id);
  if (s) {
    s.suggestedPoints = Number(val) || 0;
  }
};

const updateSuggestionContent = (id: string, val: string): void => {
  const s = aiSuggestions.value.find((item: HomeworkSuggestion) => item.id === id);
  if (s) {
    s.content = val;
  }
};

const handleConfirmSuggestions = async (): Promise<void> => {
  if (selectedSuggestionIds.value.length === 0 || !currentChildId.value) return;
  aiConfirming.value = true;
  try {
    const result = await aiApi.confirmSuggestions({
      suggestionIds: selectedSuggestionIds.value,
      childId: currentChildId.value,
    });
    toast.success(`已加入 ${result.confirmedCount} 条任务到任务池`);
    aiDialogOpen.value = false;
    void fetchTasks();
  } catch (error) {
    logger.error('确认建议失败', error);
    toast.error('加入失败，请重试');
  } finally {
    aiConfirming.value = false;
  }
};

// Image upload handling
// 手机照片 base64 可达数 MB，先在前端压缩（最大边 1280、JPEG 0.82），
// 避免请求体超过后端上限，也降低上游识别接口的开销。
const compressImage = (file: File, maxSize = 1280, quality = 0.82): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('解析图片失败'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });

async function processImageFiles(files: File[]): Promise<void> {
  for (const file of files) {
    uploadedImages.value.push(file);
    try {
      imagePreviews.value.push(await compressImage(file));
    } catch (err) {
      logger.error('图片处理失败', err as Error);
      toast.error('图片处理失败，请重试');
    }
  }
}

const handleImageSelect = (e: Event): void => {
  const target = e.target as HTMLInputElement;
  const files = target.files ? Array.from(target.files) : [];
  target.value = '';
  const images = files.filter((f) => f.type.startsWith('image/'));
  if (images.length === 0) return;
  void processImageFiles(images);
};

const removeImage = (index: number): void => {
  uploadedImages.value.splice(index, 1);
  imagePreviews.value.splice(index, 1);
};
</script>

<template>
  <!-- 加载中 -->
  <div v-if="childLoading" class="min-h-full bg-[#FFF7E6] p-4 sm:p-6 flex items-center justify-center">
    <p class="text-gray-400">加载中...</p>
  </div>

  <!-- 无孩子空态 -->
  <div v-else-if="!currentChildId" class="min-h-full bg-[#FFF7E6] p-4 sm:p-6 flex items-center justify-center">
    <div class="text-center">
      <BookOpen class="mx-auto h-12 w-12 text-blue-200" />
      <p class="mt-3 text-gray-500">请先在「孩子管理」中添加孩子</p>
    </div>
  </div>

  <!-- 主内容 -->
  <div v-else class="min-h-full bg-[#FFF7E6] p-4 sm:p-6">
    <!-- Header -->
    <div class="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div class="flex items-center gap-3">
        <div>
          <h1 class="text-2xl font-bold text-[#1F2329]">作业任务池</h1>
          <p class="mt-1 text-sm text-gray-500">AI 智能识别作业与手动添加的任务池</p>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button
          size="lg"
          @click="openAiDialog"
          class="rounded-full bg-gradient-to-r from-[#FF8A3D] to-[#FF6B1A] hover:from-[#FF7A1F] hover:to-[#FF5B0A] text-white shadow-lg hover:shadow-xl text-base px-6"
        >
          <Sparkles class="h-5 w-5" />
          AI 智能导入作业
        </Button>
        <Button
          size="lg"
          variant="outline"
          @click="void handleGenerateDaily()"
          class="rounded-full border-[#FF8A3D] text-[#FF8A3D] hover:bg-orange-50"
        >
          生成每日任务
        </Button>
        <Button
          size="lg"
          @click="openCreateDialog"
          class="rounded-full bg-[#FF8A3D] hover:bg-[#FF7A1F] text-white shadow-md"
        >
          <Plus class="h-5 w-5" />
          添加作业
        </Button>
      </div>
    </div>

    <!-- 任务分类：全部 / 单项 / 多项 -->
    <div class="mb-4 flex flex-wrap gap-2">
      <button
        v-for="opt in taskCategoryOptions"
        :key="opt.value"
        type="button"
        @click="taskCategory = opt.value"
        :class="[
          'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
          taskCategory === opt.value
            ? 'bg-[#FF8A3D] text-white shadow-md'
            : 'bg-white text-gray-600 hover:bg-orange-50',
        ]"
      >
        {{ opt.label }}
        <span class="ml-1 text-xs opacity-70">{{ opt.count }}</span>
      </button>
    </div>

    <!-- Loading / Empty / Task Groups -->
    <div v-if="loading" class="rounded-2xl bg-white p-8 text-center text-gray-400 shadow-md">
      加载中...
    </div>
    <div v-else-if="tasks.length === 0" class="rounded-2xl bg-white p-12 text-center shadow-md">
      <BookOpen class="mx-auto h-12 w-12 text-blue-200" />
      <p class="mt-3 text-gray-400">今天还没有作业任务，点击右上角添加</p>
    </div>
    <div v-else-if="visibleTasks.length === 0" class="rounded-2xl bg-white p-12 text-center shadow-md">
      <p class="text-gray-400">当前分类下没有任务</p>
    </div>
    <div v-else class="space-y-6">
      <!-- 待完成 -->
      <section v-if="groupedTasks.pending.length > 0">
        <div class="mb-3 flex items-center gap-2">
          <Clock class="h-5 w-5 text-gray-400" />
          <span class="text-sm font-semibold text-[#1F2329]">待完成</span>
          <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
            {{ groupedTasks.pending.length }}
          </span>
        </div>
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="task in groupedTasks.pending"
            :key="task.id"
            class="rounded-2xl bg-white p-4 shadow-md transition-shadow hover:shadow-lg"
          >
            <!-- Task Card Content -->
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <BookOpen v-if="task.type === 'homework'" class="h-5 w-5 text-[#36BFFA] flex-shrink-0" />
                <Star v-else class="h-5 w-5 text-[#FF8A3D] flex-shrink-0" />
                <h3 class="text-base font-semibold text-[#1F2329] truncate">{{ task.name }}</h3>
              </div>
              <div class="flex items-center gap-1 flex-shrink-0">
                <button
                  v-if="task.type === 'homework' && task.status === 'pending'"
                  type="button"
                  class="p-1 text-gray-400 hover:text-[#FF8A3D] hover:bg-orange-50 rounded-lg transition-colors"
                  @click="openEditTask(task)"
                  title="编辑"
                >
                  <Edit3 class="h-4 w-4" />
                </button>
                <button
                  type="button"
                  class="p-1 text-gray-400 hover:text-[#FF4D4F] hover:bg-red-50 rounded-lg transition-colors"
                  @click="openDeleteConfirm(task.id)"
                  title="删除"
                >
                  <Trash2 class="h-4 w-4" />
                </button>
                <Badge
                  variant="default"
                  :class="'rounded-full ' + STATUS_COLORS[task.status]"
                >
                  {{ STATUS_LABELS[task.status] }}
                </Badge>
              </div>
            </div>

            <div class="mt-3 flex flex-wrap items-center gap-2">
              <Badge
                v-if="task.subject"
                variant="outline"
                class="rounded-full border-blue-200 text-[#36BFFA]"
              >
                {{ task.subject }}
              </Badge>
              <Badge
                variant="default"
                class="rounded-full bg-orange-100 text-[#FF8A3D] border-transparent"
              >
{{ task.points }} 积分
              </Badge>
              <span v-if="task.deadline" class="flex items-center gap-1 text-xs text-gray-400">
                <Clock class="h-3 w-3" />
                截止 {{ task.deadline }}
              </span>
            </div>

            <!-- Subtasks toggle -->
            <button
              v-if="hasTaskSubtasks(task)"
              type="button"
              class="mt-2 flex items-center gap-1 text-xs text-gray-500 hover:text-[#FF8A3D] transition-colors"
              @click="toggleTaskExpand(task.id)"
            >
              <span>多项任务 · 已完成 {{ getCompletedSubtaskCount(task) }}/{{ getTaskSubtasks(task).length }}</span>
              <ChevronDown v-if="!expandedTaskIds.has(task.id)" class="h-3 w-3" />
              <ChevronUp v-else class="h-3 w-3" />
            </button>

            <!-- Subtasks list -->
            <div
              v-if="hasTaskSubtasks(task) && expandedTaskIds.has(task.id)"
              class="mt-2 space-y-1 rounded-xl bg-orange-50/50 p-3"
            >
              
              <button
                v-for="(st, idx) in getTaskSubtasks(task)"
                :key="st.id || idx"
                type="button"
                class="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-sm transition-colors hover:bg-orange-100/60 disabled:cursor-not-allowed"
                :disabled="task.status === 'completed' || togglingSubtaskIds.has(st.id)"
                @click="void handleToggleSubtask(task, st)"
              >
                <CheckCircle2 v-if="st.isCompleted" class="h-4 w-4 flex-shrink-0 text-[#52C41A]" />
                <Circle v-else class="h-4 w-4 flex-shrink-0 text-gray-300" />
                <span
                  :class="[
                    'flex-1',
                    st.isCompleted ? 'text-gray-400 line-through' : 'text-[#1F2329]',
                  ]"
                >
                  {{ st.content }}
                </span>
              </button>

            </div>

            <div
              v-if="task.rejectReason"
              class="mt-3 rounded-xl bg-red-50 p-2 text-xs text-red-500"
            >
              <span class="font-medium">驳回原因：</span>
              {{ task.rejectReason }}
            </div>

            <div
              v-if="task.completionNote"
              class="mt-3 rounded-xl bg-gray-50 p-2 text-xs text-gray-500"
            >
              <span class="font-medium">完成说明：</span>
              {{ task.completionNote }}
            </div>

            <div class="mt-4 flex gap-2 border-t border-gray-100 pt-3">
              <Button
                size="sm"
                @click="void handleSubmitTask(task.id)"
                class="flex-1 rounded-full bg-[#52C41A] hover:bg-[#45B018] text-white"
              >
                <CheckCircle class="h-4 w-4" />
                提交完成
              </Button>
            </div>
          </div>
        </div>
      </section>

      <!-- 待确认 -->
      <section v-if="groupedTasks.submitted.length > 0">
        <div class="mb-3 flex items-center gap-2">
          <AlertCircle class="h-5 w-5 text-[#FF8A3D]" />
          <span class="text-sm font-semibold text-[#1F2329]">待确认</span>
          <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
            {{ groupedTasks.submitted.length }}
          </span>
        </div>
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="task in groupedTasks.submitted"
            :key="task.id"
            class="rounded-2xl bg-white p-4 shadow-md transition-shadow hover:shadow-lg"
          >
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <BookOpen v-if="task.type === 'homework'" class="h-5 w-5 text-[#36BFFA] flex-shrink-0" />
                <Star v-else class="h-5 w-5 text-[#FF8A3D] flex-shrink-0" />
                <h3 class="text-base font-semibold text-[#1F2329] truncate">{{ task.name }}</h3>
              </div>
              <div class="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  class="p-1 text-gray-400 hover:text-[#FF4D4F] hover:bg-red-50 rounded-lg transition-colors"
                  @click="openDeleteConfirm(task.id)"
                  title="删除"
                >
                  <Trash2 class="h-4 w-4" />
                </button>
                <Badge
                  variant="default"
                  :class="'rounded-full ' + STATUS_COLORS[task.status]"
                >
                  {{ STATUS_LABELS[task.status] }}
                </Badge>
              </div>
            </div>

            <div class="mt-3 flex flex-wrap items-center gap-2">
              <Badge
                v-if="task.subject"
                variant="outline"
                class="rounded-full border-blue-200 text-[#36BFFA]"
              >
                {{ task.subject }}
              </Badge>
              <Badge
                variant="default"
                class="rounded-full bg-orange-100 text-[#FF8A3D] border-transparent"
              >
{{ task.points }} 积分
              </Badge>
              <span v-if="task.deadline" class="flex items-center gap-1 text-xs text-gray-400">
                <Clock class="h-3 w-3" />
                截止 {{ task.deadline }}
              </span>
            </div>

            <!-- Subtasks toggle -->
            <button
              v-if="hasTaskSubtasks(task)"
              type="button"
              class="mt-2 flex items-center gap-1 text-xs text-gray-500 hover:text-[#FF8A3D] transition-colors"
              @click="toggleTaskExpand(task.id)"
            >
              <span>多项任务 · 已完成 {{ getCompletedSubtaskCount(task) }}/{{ getTaskSubtasks(task).length }}</span>
              <ChevronDown v-if="!expandedTaskIds.has(task.id)" class="h-3 w-3" />
              <ChevronUp v-else class="h-3 w-3" />
            </button>

            <!-- Subtasks list -->
            <div
              v-if="hasTaskSubtasks(task) && expandedTaskIds.has(task.id)"
              class="mt-2 space-y-1 rounded-xl bg-orange-50/50 p-3"
            >
              
              <button
                v-for="(st, idx) in getTaskSubtasks(task)"
                :key="st.id || idx"
                type="button"
                class="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-sm transition-colors hover:bg-orange-100/60 disabled:cursor-not-allowed"
                :disabled="task.status === 'completed' || togglingSubtaskIds.has(st.id)"
                @click="void handleToggleSubtask(task, st)"
              >
                <CheckCircle2 v-if="st.isCompleted" class="h-4 w-4 flex-shrink-0 text-[#52C41A]" />
                <Circle v-else class="h-4 w-4 flex-shrink-0 text-gray-300" />
                <span
                  :class="[
                    'flex-1',
                    st.isCompleted ? 'text-gray-400 line-through' : 'text-[#1F2329]',
                  ]"
                >
                  {{ st.content }}
                </span>
              </button>

            </div>

            <div
              v-if="task.rejectReason"
              class="mt-3 rounded-xl bg-red-50 p-2 text-xs text-red-500"
            >
              <span class="font-medium">驳回原因：</span>
              {{ task.rejectReason }}
            </div>

            <div
              v-if="task.completionNote"
              class="mt-3 rounded-xl bg-gray-50 p-2 text-xs text-gray-500"
            >
              <span class="font-medium">完成说明：</span>
              {{ task.completionNote }}
            </div>

            <div class="mt-4 flex gap-2 border-t border-gray-100 pt-3">
              <Button
                size="sm"
                @click="void handleApprove(task.id)"
                class="flex-1 rounded-full bg-[#52C41A] hover:bg-[#45B018] text-white"
              >
                <CheckCircle class="h-4 w-4" />
                通过
              </Button>
              <Button
                size="sm"
                variant="outline"
                @click="openRejectDialog(task.id)"
                class="flex-1 rounded-full border-red-300 text-[#FF4D4F] hover:bg-red-50"
              >
                <XCircle class="h-4 w-4" />
                驳回
              </Button>
            </div>
          </div>
        </div>
      </section>

      <!-- 已完成 -->
      <section v-if="groupedTasks.completed.length > 0">
        <div class="mb-3 flex items-center gap-2">
          <CheckCircle class="h-5 w-5 text-[#52C41A]" />
          <span class="text-sm font-semibold text-[#1F2329]">已完成</span>
          <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
            {{ groupedTasks.completed.length }}
          </span>
        </div>
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="task in groupedTasks.completed"
            :key="task.id"
            class="rounded-2xl bg-white p-4 shadow-md transition-shadow hover:shadow-lg"
          >
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <BookOpen v-if="task.type === 'homework'" class="h-5 w-5 text-[#36BFFA] flex-shrink-0" />
                <Star v-else class="h-5 w-5 text-[#FF8A3D] flex-shrink-0" />
                <h3 class="text-base font-semibold text-[#1F2329] truncate">{{ task.name }}</h3>
              </div>
              <div class="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  class="p-1 text-gray-400 hover:text-[#FF4D4F] hover:bg-red-50 rounded-lg transition-colors"
                  @click="openDeleteConfirm(task.id)"
                  title="删除"
                >
                  <Trash2 class="h-4 w-4" />
                </button>
                <Badge
                  variant="default"
                  :class="'rounded-full ' + STATUS_COLORS[task.status]"
                >
                  {{ STATUS_LABELS[task.status] }}
                </Badge>
              </div>
            </div>

            <div class="mt-3 flex flex-wrap items-center gap-2">
              <Badge
                v-if="task.subject"
                variant="outline"
                class="rounded-full border-blue-200 text-[#36BFFA]"
              >
                {{ task.subject }}
              </Badge>
              <Badge
                variant="default"
                class="rounded-full bg-orange-100 text-[#FF8A3D] border-transparent"
              >
{{ task.points }} 积分
              </Badge>
              <span v-if="task.deadline" class="flex items-center gap-1 text-xs text-gray-400">
                <Clock class="h-3 w-3" />
                截止 {{ task.deadline }}
              </span>
            </div>

            <!-- Subtasks toggle -->
            <button
              v-if="hasTaskSubtasks(task)"
              type="button"
              class="mt-2 flex items-center gap-1 text-xs text-gray-500 hover:text-[#FF8A3D] transition-colors"
              @click="toggleTaskExpand(task.id)"
            >
              <span>多项任务 · 已完成 {{ getCompletedSubtaskCount(task) }}/{{ getTaskSubtasks(task).length }}</span>
              <ChevronDown v-if="!expandedTaskIds.has(task.id)" class="h-3 w-3" />
              <ChevronUp v-else class="h-3 w-3" />
            </button>

            <!-- Subtasks list -->
            <div
              v-if="hasTaskSubtasks(task) && expandedTaskIds.has(task.id)"
              class="mt-2 space-y-1 rounded-xl bg-orange-50/50 p-3"
            >
              
              <button
                v-for="(st, idx) in getTaskSubtasks(task)"
                :key="st.id || idx"
                type="button"
                class="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-sm transition-colors hover:bg-orange-100/60 disabled:cursor-not-allowed"
                :disabled="task.status === 'completed' || togglingSubtaskIds.has(st.id)"
                @click="void handleToggleSubtask(task, st)"
              >
                <CheckCircle2 v-if="st.isCompleted" class="h-4 w-4 flex-shrink-0 text-[#52C41A]" />
                <Circle v-else class="h-4 w-4 flex-shrink-0 text-gray-300" />
                <span
                  :class="[
                    'flex-1',
                    st.isCompleted ? 'text-gray-400 line-through' : 'text-[#1F2329]',
                  ]"
                >
                  {{ st.content }}
                </span>
              </button>

            </div>

            <div
              v-if="task.rejectReason"
              class="mt-3 rounded-xl bg-red-50 p-2 text-xs text-red-500"
            >
              <span class="font-medium">驳回原因：</span>
              {{ task.rejectReason }}
            </div>

            <div
              v-if="task.completionNote"
              class="mt-3 rounded-xl bg-gray-50 p-2 text-xs text-gray-500"
            >
              <span class="font-medium">完成说明：</span>
              {{ task.completionNote }}
            </div>

            <div class="mt-4 flex gap-2 border-t border-gray-100 pt-3">
              <div
                v-if="task.finalPoints !== null"
                class="flex-1 text-center text-sm font-medium text-[#52C41A]"
              >
                已获得 {{ task.finalPoints }} 积分
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 已逾期 -->
      <section v-if="groupedTasks.overdue.length > 0">
        <div class="mb-3 flex items-center gap-2">
          <XCircle class="h-5 w-5 text-[#FF4D4F]" />
          <span class="text-sm font-semibold text-[#1F2329]">已逾期</span>
          <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
            {{ groupedTasks.overdue.length }}
          </span>
        </div>
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="task in groupedTasks.overdue"
            :key="task.id"
            class="rounded-2xl bg-white p-4 shadow-md transition-shadow hover:shadow-lg"
          >
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <BookOpen v-if="task.type === 'homework'" class="h-5 w-5 text-[#36BFFA] flex-shrink-0" />
                <Star v-else class="h-5 w-5 text-[#FF8A3D] flex-shrink-0" />
                <h3 class="text-base font-semibold text-[#1F2329] truncate">{{ task.name }}</h3>
              </div>
              <div class="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  class="p-1 text-gray-400 hover:text-[#FF4D4F] hover:bg-red-50 rounded-lg transition-colors"
                  @click="openDeleteConfirm(task.id)"
                  title="删除"
                >
                  <Trash2 class="h-4 w-4" />
                </button>
                <Badge
                  variant="default"
                  :class="'rounded-full ' + STATUS_COLORS[task.status]"
                >
                  {{ STATUS_LABELS[task.status] }}
                </Badge>
              </div>
            </div>

            <div class="mt-3 flex flex-wrap items-center gap-2">
              <Badge
                v-if="task.subject"
                variant="outline"
                class="rounded-full border-blue-200 text-[#36BFFA]"
              >
                {{ task.subject }}
              </Badge>
              <Badge
                variant="default"
                class="rounded-full bg-orange-100 text-[#FF8A3D] border-transparent"
              >
{{ task.points }} 积分
              </Badge>
              <span v-if="task.deadline" class="flex items-center gap-1 text-xs text-gray-400">
                <Clock class="h-3 w-3" />
                截止 {{ task.deadline }}
              </span>
            </div>

            <!-- Subtasks toggle -->
            <button
              v-if="hasTaskSubtasks(task)"
              type="button"
              class="mt-2 flex items-center gap-1 text-xs text-gray-500 hover:text-[#FF8A3D] transition-colors"
              @click="toggleTaskExpand(task.id)"
            >
              <span>多项任务 · 已完成 {{ getCompletedSubtaskCount(task) }}/{{ getTaskSubtasks(task).length }}</span>
              <ChevronDown v-if="!expandedTaskIds.has(task.id)" class="h-3 w-3" />
              <ChevronUp v-else class="h-3 w-3" />
            </button>

            <!-- Subtasks list -->
            <div
              v-if="hasTaskSubtasks(task) && expandedTaskIds.has(task.id)"
              class="mt-2 space-y-1 rounded-xl bg-orange-50/50 p-3"
            >
              
              <button
                v-for="(st, idx) in getTaskSubtasks(task)"
                :key="st.id || idx"
                type="button"
                class="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-sm transition-colors hover:bg-orange-100/60 disabled:cursor-not-allowed"
                :disabled="task.status === 'completed' || togglingSubtaskIds.has(st.id)"
                @click="void handleToggleSubtask(task, st)"
              >
                <CheckCircle2 v-if="st.isCompleted" class="h-4 w-4 flex-shrink-0 text-[#52C41A]" />
                <Circle v-else class="h-4 w-4 flex-shrink-0 text-gray-300" />
                <span
                  :class="[
                    'flex-1',
                    st.isCompleted ? 'text-gray-400 line-through' : 'text-[#1F2329]',
                  ]"
                >
                  {{ st.content }}
                </span>
              </button>

            </div>

            <div
              v-if="task.rejectReason"
              class="mt-3 rounded-xl bg-red-50 p-2 text-xs text-red-500"
            >
              <span class="font-medium">驳回原因：</span>
              {{ task.rejectReason }}
            </div>

            <div
              v-if="task.completionNote"
              class="mt-3 rounded-xl bg-gray-50 p-2 text-xs text-gray-500"
            >
              <span class="font-medium">完成说明：</span>
              {{ task.completionNote }}
            </div>

            <div class="mt-4 flex gap-2 border-t border-gray-100 pt-3"></div>
          </div>
        </div>
      </section>

      <!-- 已驳回 -->
      <section v-if="groupedTasks.rejected.length > 0">
        <div class="mb-3 flex items-center gap-2">
          <XCircle class="h-5 w-5 text-[#FF4D4F]" />
          <span class="text-sm font-semibold text-[#1F2329]">已驳回</span>
          <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
            {{ groupedTasks.rejected.length }}
          </span>
        </div>
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="task in groupedTasks.rejected"
            :key="task.id"
            class="rounded-2xl bg-white p-4 shadow-md transition-shadow hover:shadow-lg"
          >
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <BookOpen v-if="task.type === 'homework'" class="h-5 w-5 text-[#36BFFA] flex-shrink-0" />
                <Star v-else class="h-5 w-5 text-[#FF8A3D] flex-shrink-0" />
                <h3 class="text-base font-semibold text-[#1F2329] truncate">{{ task.name }}</h3>
              </div>
              <div class="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  class="p-1 text-gray-400 hover:text-[#FF4D4F] hover:bg-red-50 rounded-lg transition-colors"
                  @click="openDeleteConfirm(task.id)"
                  title="删除"
                >
                  <Trash2 class="h-4 w-4" />
                </button>
                <Badge
                  variant="default"
                  :class="'rounded-full ' + STATUS_COLORS[task.status]"
                >
                  {{ STATUS_LABELS[task.status] }}
                </Badge>
              </div>
            </div>

            <div class="mt-3 flex flex-wrap items-center gap-2">
              <Badge
                v-if="task.subject"
                variant="outline"
                class="rounded-full border-blue-200 text-[#36BFFA]"
              >
                {{ task.subject }}
              </Badge>
              <Badge
                variant="default"
                class="rounded-full bg-orange-100 text-[#FF8A3D] border-transparent"
              >
{{ task.points }} 积分
              </Badge>
              <span v-if="task.deadline" class="flex items-center gap-1 text-xs text-gray-400">
                <Clock class="h-3 w-3" />
                截止 {{ task.deadline }}
              </span>
            </div>

            <!-- Subtasks toggle -->
            <button
              v-if="hasTaskSubtasks(task)"
              type="button"
              class="mt-2 flex items-center gap-1 text-xs text-gray-500 hover:text-[#FF8A3D] transition-colors"
              @click="toggleTaskExpand(task.id)"
            >
              <span>多项任务 · 已完成 {{ getCompletedSubtaskCount(task) }}/{{ getTaskSubtasks(task).length }}</span>
              <ChevronDown v-if="!expandedTaskIds.has(task.id)" class="h-3 w-3" />
              <ChevronUp v-else class="h-3 w-3" />
            </button>

            <!-- Subtasks list -->
            <div
              v-if="hasTaskSubtasks(task) && expandedTaskIds.has(task.id)"
              class="mt-2 space-y-1 rounded-xl bg-orange-50/50 p-3"
            >
              
              <button
                v-for="(st, idx) in getTaskSubtasks(task)"
                :key="st.id || idx"
                type="button"
                class="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-sm transition-colors hover:bg-orange-100/60 disabled:cursor-not-allowed"
                :disabled="task.status === 'completed' || togglingSubtaskIds.has(st.id)"
                @click="void handleToggleSubtask(task, st)"
              >
                <CheckCircle2 v-if="st.isCompleted" class="h-4 w-4 flex-shrink-0 text-[#52C41A]" />
                <Circle v-else class="h-4 w-4 flex-shrink-0 text-gray-300" />
                <span
                  :class="[
                    'flex-1',
                    st.isCompleted ? 'text-gray-400 line-through' : 'text-[#1F2329]',
                  ]"
                >
                  {{ st.content }}
                </span>
              </button>

            </div>

            <div
              v-if="task.rejectReason"
              class="mt-3 rounded-xl bg-red-50 p-2 text-xs text-red-500"
            >
              <span class="font-medium">驳回原因：</span>
              {{ task.rejectReason }}
            </div>

            <div
              v-if="task.completionNote"
              class="mt-3 rounded-xl bg-gray-50 p-2 text-xs text-gray-500"
            >
              <span class="font-medium">完成说明：</span>
              {{ task.completionNote }}
            </div>

            <div class="mt-4 flex gap-2 border-t border-gray-100 pt-3"></div>
          </div>
        </div>
      </section>
    </div>

    <!-- Create Homework Dialog -->
    <Dialog v-model:modelValue="dialogOpen" :title="isEditMode ? '编辑作业任务' : '添加作业任务'">
      <div class="space-y-4 py-2">
        <div class="space-y-2">
          <Label for="task-name" class="text-sm font-medium text-[#1F2329]">
            任务名称
          </Label>
          <Input
            id="task-name"
            v-model:value="formData.name"
            :placeholder="hasSubtasks ? '如：数学作业' : '如：练习册第10页'"
            class="rounded-xl"
          />
        </div>

        <div class="space-y-2">
          <Label for="subject" class="text-sm font-medium text-[#1F2329]">
            科目
          </Label>
          <Select
            id="subject"
            v-model:modelValue="formData.subject"
            :options="SUBJECT_OPTIONS"
            placeholder="选择科目"
          />
        </div>

        <div class="space-y-2">
          <Label for="points" class="text-sm font-medium text-[#1F2329]">
            积分
            <span class="text-xs text-gray-400 ml-1">（每科作业固定积分，与子任务无关）</span>
          </Label>
          <Input
            id="points"
            type="number"
            :value="String(formData.points)"
            @update:value="(v: string | number) => formData.points = Number(v) || 0"
            class="rounded-xl"
          />
        </div>

        <div class="space-y-2">
          <Label for="task-date" class="text-sm font-medium text-[#1F2329]">
            任务日期
          </Label>
          <DatePicker
            id="task-date"
            v-model:modelValue="formData.taskDate"
            placeholder="请选择任务日期"
          />
        </div>

        <div class="space-y-2">
          <Label for="deadline" class="text-sm font-medium text-[#1F2329]">
            截止日期（可选）
          </Label>
          <DatePicker
            id="deadline"
            v-model:modelValue="formData.deadline"
            placeholder="请选择截止日期"
          />
        </div>

        <!-- 遇周末/节假日顺延 -->
        <div class="space-y-2 rounded-xl bg-orange-50/60 p-3">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-medium text-[#1F2329]">遇周末/节假日顺延</p>
              <p class="mt-0.5 text-xs text-gray-500">
                开启后，作业在截止日之后的 N 天内仍可完成，不算逾期
              </p>
            </div>
            <Switch
              :checked="formData.extendHoliday"
              @update:checked="(v: boolean) => formData.extendHoliday = v"
              class="data-[state=checked]:bg-[#FF8A3D]"
            />
          </div>
          <div v-if="formData.extendHoliday" class="flex flex-wrap items-center gap-2">
            <span class="text-sm text-gray-600">顺延</span>
            <div class="w-24">
              <Input
                type="number"
                :value="String(formData.extendDays)"
                @update:value="(v: string | number) => formData.extendDays = Number(v) || 0"
                class="rounded-xl text-sm h-9"
              />
            </div>
            <span class="text-sm text-gray-600">天</span>
            <span
              v-if="effectiveDeadlinePreview"
              class="ml-auto text-xs font-medium text-[#FF8A3D]"
            >
              顺延至 {{ effectiveDeadlinePreview }}
            </span>
          </div>
          <button
            v-if="deadlineIsFriday && !formData.extendHoliday"
            type="button"
            class="text-xs text-[#FF8A3D] underline"
            @click="applyWeekendExtend"
          >
            周五布置？一键顺延 2 天（到周日）
          </button>
        </div>

        <!-- Subtasks section -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <Label class="text-sm font-medium text-[#1F2329]">
              子任务（可选）
            </Label>
            <button
              type="button"
              class="flex items-center gap-1 text-xs text-[#FF8A3D] hover:text-[#FF7A1F] font-medium transition-colors"
              @click="addSubtask"
            >
              <Plus class="h-3 w-3" />
              添加子任务
            </button>
          </div>
          <div v-if="formSubtasks.length > 0" class="space-y-2">
            <div
              v-for="(subtask, index) in formSubtasks"
              :key="index"
              class="flex items-center gap-2"
            >
              <div class="flex-1">
                <Input
                  v-model:value="subtask.content"
                  :placeholder="`子任务 ${index + 1}`"
                  class="rounded-xl text-sm"
                />
              </div>
              <button
                type="button"
                class="p-1.5 text-gray-400 hover:text-[#FF4D4F] hover:bg-red-50 rounded-lg transition-colors"
                @click="removeSubtask(index)"
                title="删除子任务"
              >
                <Trash2 class="h-4 w-4" />
              </button>
            </div>
          </div>
          <p v-else class="text-xs text-gray-400">
            不添加子任务即为普通单条作业任务
          </p>
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
          @click="void handleCreateHomework()"
          class="rounded-full bg-[#FF8A3D] hover:bg-[#FF7A1F] text-white"
          :disabled="!formData.name.trim()"
        >
          {{ isEditMode ? '保存修改' : '添加任务' }}
        </Button>
      </template>
    </Dialog>

    <!-- Reject Reason Dialog -->
    <Dialog
      :modelValue="reviewTaskId !== null"
      @update:modelValue="handleRejectDialogOpenChange"
      title="驳回任务"
    >
      <div class="space-y-2">
        <Label for="reject-reason" class="text-sm font-medium text-[#1F2329]">
          驳回原因
        </Label>
        <Textarea
          id="reject-reason"
          v-model:modelValue="rejectReason"
          placeholder="请填写驳回原因，孩子会看到"
          class="rounded-xl"
          :rows="3"
        />
      </div>

      <template #footer>
        <Button
          variant="outline"
          @click="closeRejectDialog"
          class="rounded-full"
        >
          取消
        </Button>
        <Button
          variant="destructive"
          @click="reviewTaskId && void handleReject(reviewTaskId)"
          class="rounded-full bg-[#FF4D4F] hover:bg-[#FF3333] text-white"
        >
          确认驳回
        </Button>
      </template>
    </Dialog>

    <!-- Delete Confirm Dialog -->
    <Dialog
      :modelValue="deleteTaskId !== null"
      @update:modelValue="handleDeleteDialogOpenChange"
      title="删除任务"
    >
      <div class="py-2">
        <p class="text-sm text-[#1F2329]">确定要删除这条任务吗？删除后无法恢复。</p>
      </div>

      <template #footer>
        <Button
          variant="outline"
          @click="closeDeleteConfirm"
          class="rounded-full"
        >
          取消
        </Button>
        <Button
          variant="destructive"
          @click="void handleDeleteTask()"
          class="rounded-full bg-[#FF4D4F] hover:bg-[#FF3333] text-white"
        >
          确认删除
        </Button>
      </template>
    </Dialog>

    <!-- AI 智能导入 Dialog -->
    <Dialog
      v-model:modelValue="aiDialogOpen"
      title="AI 智能导入作业"
      maxWidthClass="sm:max-w-md"
    >
      <!-- Tabs -->
      <div class="flex border-b border-orange-100 mb-4 -mx-6 -mt-4 px-6">
        <button
          type="button"
          class="flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors"
          :class="aiTab === 'text'
            ? 'border-[#FF8A3D] text-[#FF8A3D]'
            : 'border-transparent text-gray-500 hover:text-[#1F2329]'"
          @click="aiTab = 'text'"
        >
          <FileText class="h-4 w-4" />
          文字输入
        </button>
        <button
          type="button"
          class="flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors"
          :class="aiTab === 'image'
            ? 'border-[#FF8A3D] text-[#FF8A3D]'
            : 'border-transparent text-gray-500 hover:text-[#1F2329]'"
          @click="aiTab = 'image'"
        >
          <Upload class="h-4 w-4" />
          上传图片
        </button>
      </div>

      <!-- 文字输入 Tab -->
      <div v-if="aiTab === 'text'" class="space-y-4">
        <div class="space-y-2">
          <Label class="text-sm font-medium text-[#1F2329]">
            粘贴作业内容
          </Label>
          <Textarea
            v-model:modelValue="aiTextContent"
            placeholder="粘贴作业内容，AI 将自动识别并生成任务建议..."
            class="rounded-xl min-h-[120px]"
            :rows="6"
          />
        </div>

        <div class="flex justify-end">
          <Button
            @click="void handleRecognizeByText()"
            :disabled="!aiTextContent.trim() || aiRecognizing"
            class="rounded-full bg-[#FF8A3D] hover:bg-[#FF7A1F] text-white"
          >
            <Sparkles class="h-4 w-4" />
            {{ aiRecognizing ? '识别中...' : '开始识别' }}
          </Button>
        </div>

        <!-- Suggestions -->
        <div v-if="aiSuggestions.length > 0" class="space-y-3 pt-2 border-t border-orange-100">
          <div class="flex items-center justify-between">
            <span class="text-sm font-semibold text-[#1F2329]">
              识别结果（{{ aiSuggestions.length }} 条）
            </span>
            <span class="text-xs text-gray-500">
              已选 {{ selectedSuggestionIds.length }} 条
            </span>
          </div>
           <div class="space-y-3 max-h-[300px] overflow-y-auto pr-1">
             <div
               v-for="s in aiSuggestions"
               :key="s.id"
               class="rounded-xl border p-3 transition-colors"
               :class="selectedSuggestionIds.includes(s.id)
                 ? 'border-[#FF8A3D] bg-orange-50/50'
                 : 'border-gray-200 bg-white hover:border-orange-200'"
             >
               <div class="flex items-start gap-2">
                 <input
                   type="checkbox"
                   :checked="selectedSuggestionIds.includes(s.id)"
                   @change="toggleSuggestion(s.id)"
                   class="mt-1 h-4 w-4 rounded border-gray-300 text-[#FF8A3D] focus:ring-[#FF8A3D]"
                 />
                 <div class="flex-1 min-w-0 space-y-2">
                   <div class="flex items-center gap-2">
                     <Badge
                       variant="outline"
                       class="rounded-full border-blue-200 text-[#36BFFA] text-xs"
                     >
                       {{ s.subject }}
                     </Badge>
                     <span v-if="s.quantity > 1" class="text-xs text-gray-500">
                       共 {{ s.quantity }} 项
                     </span>
                   </div>
                   <Textarea
                     v-model:modelValue="s.content"
                     class="rounded-xl text-sm"
                     :rows="2"
                   />
                   <div class="flex items-center gap-2">
                     <span class="text-xs text-gray-500">积分：</span>
                     <Input
                       type="number"
                       :value="s.suggestedPoints"
                       @update:value="(v: string | number) => updateSuggestionPoints(s.id, String(v))"
                       class="rounded-xl w-20 h-8"
                     />
                     <span class="text-xs text-gray-500">分</span>
                   </div>

                   <!-- Subtasks in AI suggestions -->
                   <button
                     v-if="s.subtasks && s.subtasks.length > 0"
                     type="button"
                     class="flex items-center gap-1 text-xs text-gray-500 hover:text-[#FF8A3D] transition-colors"
                     @click.stop="toggleSuggestionExpand(s.id)"
                   >
                     <span>共 {{ s.subtasks.length }} 项子任务</span>
                     <ChevronDown v-if="!expandedSuggestionIds.has(s.id)" class="h-3 w-3" />
                     <ChevronUp v-else class="h-3 w-3" />
                   </button>
                   <div
                     v-if="s.subtasks && s.subtasks.length > 0 && expandedSuggestionIds.has(s.id)"
                     class="space-y-1 rounded-xl bg-white/70 p-2 border border-orange-100"
                   >
                     <div
                       v-for="(st, idx) in s.subtasks"
                       :key="st.id || idx"
                       class="flex items-center gap-2 text-xs"
                     >
                       <div class="h-1 w-1 rounded-full bg-[#FF8A3D] flex-shrink-0" />
                       <span class="flex-1 text-[#1F2329]">{{ st.content }}</span>
                     </div>
                   </div>
                 </div>
               </div>
             </div>
           </div>
         </div>
       </div>

       <!-- 上传图片 Tab -->
      <div v-else class="space-y-4">
        <div class="space-y-2">
          <Label class="text-sm font-medium text-[#1F2329]">
            上传作业图片
          </Label>
          <label
            class="flex flex-col items-center justify-center w-full h-40 rounded-xl border-2 border-dashed border-orange-200 bg-orange-50/30 cursor-pointer hover:border-[#FF8A3D] hover:bg-orange-50 transition-colors"
          >
            <ImageIcon class="h-8 w-8 text-[#FF8A3D] mb-2" />
            <span class="text-sm text-[#1F2329] font-medium">点击选择图片</span>
            <span class="text-xs text-gray-500 mt-1">支持 JPG、PNG 格式，可多选</span>
            <input
              type="file"
              accept="image/*"
              multiple
              class="hidden"
              @change="handleImageSelect"
            />
          </label>
        </div>

        <!-- Image previews -->
        <div v-if="imagePreviews.length > 0" class="grid grid-cols-4 gap-2">
          <div
            v-for="(src, idx) in imagePreviews"
            :key="idx"
            class="relative aspect-square rounded-lg overflow-hidden border border-orange-100"
          >
            <img :src="src" class="w-full h-full object-cover" alt="预览" />
            <button
              type="button"
              class="absolute top-1 right-1 p-0.5 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
              @click="removeImage(idx)"
            >
              <X class="h-3 w-3" />
            </button>
          </div>
        </div>

        <div class="flex justify-end">
          <Button
            @click="void handleRecognizeByImage()"
            :disabled="imagePreviews.length === 0 || aiRecognizing"
            class="rounded-full bg-[#FF8A3D] hover:bg-[#FF7A1F] text-white"
          >
            <Sparkles class="h-4 w-4" />
            {{ aiRecognizing ? '识别中...' : '开始识别' }}
          </Button>
        </div>

        <!-- Suggestions -->
        <div v-if="aiTab === 'image' && aiSuggestions.length > 0" class="space-y-3 pt-2 border-t border-orange-100">
          <div class="flex items-center justify-between">
            <span class="text-sm font-semibold text-[#1F2329]">
              识别结果（{{ aiSuggestions.length }} 条）
            </span>
            <span class="text-xs text-gray-500">
              已选 {{ selectedSuggestionIds.length }} 条
            </span>
          </div>
         <div class="space-y-3 max-h-[300px] overflow-y-auto pr-1">
             <div
               v-for="s in aiSuggestions"
               :key="s.id"
               class="rounded-xl border p-3 transition-colors"
               :class="selectedSuggestionIds.includes(s.id)
                 ? 'border-[#FF8A3D] bg-orange-50/50'
                 : 'border-gray-200 bg-white hover:border-orange-200'"
             >
               <div class="flex items-start gap-2">
                 <input
                   type="checkbox"
                   :checked="selectedSuggestionIds.includes(s.id)"
                   @change="toggleSuggestion(s.id)"
                   class="mt-1 h-4 w-4 rounded border-gray-300 text-[#FF8A3D] focus:ring-[#FF8A3D]"
                 />
                 <div class="flex-1 min-w-0 space-y-2">
                   <div class="flex items-center gap-2">
                     <Badge
                       variant="outline"
                       class="rounded-full border-blue-200 text-[#36BFFA] text-xs"
                     >
                       {{ s.subject }}
                     </Badge>
                     <span v-if="s.quantity > 1" class="text-xs text-gray-500">
                       共 {{ s.quantity }} 项
                     </span>
                   </div>
                   <Textarea
                     v-model:modelValue="s.content"
                     class="rounded-xl text-sm"
                     :rows="2"
                   />
                   <div class="flex items-center gap-2">
                     <span class="text-xs text-gray-500">积分：</span>
                     <Input
                       type="number"
                       :value="s.suggestedPoints"
                       @update:value="(v: string | number) => updateSuggestionPoints(s.id, String(v))"
                       class="rounded-xl w-20 h-8"
                     />
                     <span class="text-xs text-gray-500">分</span>
                   </div>

                   <!-- Subtasks in AI suggestions -->
                   <button
                     v-if="s.subtasks && s.subtasks.length > 0"
                     type="button"
                     class="flex items-center gap-1 text-xs text-gray-500 hover:text-[#FF8A3D] transition-colors"
                     @click.stop="toggleSuggestionExpand(s.id)"
                   >
                     <span>共 {{ s.subtasks.length }} 项子任务</span>
                     <ChevronDown v-if="!expandedSuggestionIds.has(s.id)" class="h-3 w-3" />
                     <ChevronUp v-else class="h-3 w-3" />
                   </button>
                   <div
                     v-if="s.subtasks && s.subtasks.length > 0 && expandedSuggestionIds.has(s.id)"
                     class="space-y-1 rounded-xl bg-white/70 p-2 border border-orange-100"
                   >
                     <div
                       v-for="(st, idx) in s.subtasks"
                       :key="st.id || idx"
                       class="flex items-center gap-2 text-xs"
                     >
                       <div class="h-1 w-1 rounded-full bg-[#FF8A3D] flex-shrink-0" />
                       <span class="flex-1 text-[#1F2329]">{{ st.content }}</span>
                     </div>
                   </div>
                 </div>
               </div>
             </div>
           </div>
         </div>
       </div>

      <template #footer>
        <Button
          variant="outline"
          @click="aiDialogOpen = false"
          class="rounded-full"
        >
          取消
        </Button>
        <Button
          v-if="aiSuggestions.length > 0"
          @click="void handleConfirmSuggestions()"
          :disabled="selectedSuggestionIds.length === 0 || aiConfirming"
          class="rounded-full bg-[#FF8A3D] hover:bg-[#FF7A1F] text-white"
        >
          {{ aiConfirming ? '加入中...' : '确认加入任务池' }}
        </Button>
      </template>
    </Dialog>
  </div>
</template>
