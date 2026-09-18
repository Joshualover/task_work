<template>
  <div class="min-h-full bg-[#FFF7E6] p-6">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-[#1F2329]">孩子管理</h1>
        <p class="mt-1 text-sm text-gray-500">管理家庭账户下的孩子信息</p>
      </div>
      <Button
        size="lg"
        @click="handleAddClick"
        class="rounded-full bg-[#FF8A3D] text-white hover:bg-[#FF7A2D]"
      >
        <Plus class="h-5 w-5" />
        添加孩子
      </Button>
    </div>

    <div
      v-if="error"
      class="mb-4 rounded-2xl bg-red-50 p-4 text-sm text-red-600"
    >
      {{ error }}
    </div>

    <div
      v-if="loading"
      class="rounded-2xl bg-white p-8 text-center text-gray-400 shadow-md"
    >
      加载中...
    </div>

    <div
      v-else-if="children.length === 0"
      class="rounded-2xl bg-white p-12 text-center shadow-md"
      data-ai-section-type="card-list"
    >
      <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-50">
        <UserPlus class="h-8 w-8 text-[#FF8A3D]" />
      </div>
      <h3 class="mb-2 text-lg font-semibold text-[#1F2329]">还没有添加孩子</h3>
      <p class="mb-6 text-sm text-gray-500">添加孩子后即可开始配置任务与奖励</p>
      <Button
        @click="handleAddClick"
        class="rounded-full bg-[#FF8A3D] text-white hover:bg-[#FF7A2D]"
      >
        <Plus class="h-4 w-4" />
        添加第一个孩子
      </Button>
    </div>

    <div
      v-else
      class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
      data-ai-section-type="card-list"
    >
      <div
        v-for="child in children"
        :key="child.id"
        class="rounded-2xl bg-white p-4 shadow-md transition-shadow hover:shadow-lg"
      >
        <div class="flex items-start gap-4">
          <div class="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-orange-50 text-3xl">
            {{ getAvatarDisplay(child.avatarUrl) }}
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between">
              <h3 class="truncate text-lg font-semibold text-[#1F2329]">
                {{ child.name }}
              </h3>
              <button
                type="button"
                @click="handleEditClick(child)"
                class="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-orange-50 hover:text-[#FF8A3D]"
                aria-label="编辑"
              >
                <Pencil class="h-4 w-4" />
              </button>
            </div>
            <div class="mt-2 flex items-center gap-1 text-[#FF8A3D]">
              <Coins class="h-4 w-4" />
              <span class="font-semibold">{{ child.points }}</span>
              <span class="text-sm text-gray-500">积分</span>
            </div>
            <div class="mt-3 flex items-center justify-between border-t border-orange-50 pt-3">
              <span
                :class="[
                  'text-sm font-medium',
                  child.isActive ? 'text-[#52C41A]' : 'text-gray-400',
                ]"
              >
                {{ child.isActive ? '启用中' : '已停用' }}
              </span>
              <div class="flex items-center gap-2">
                <Label :for="`active-${child.id}`" class="text-sm text-gray-500">
                  状态
                </Label>
                <Switch
                  :id="`active-${child.id}`"
                  :checked="child.isActive"
                  @update:checked="void handleToggleActive(child)"
                  class="data-[state=checked]:bg-[#52C41A]"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <Dialog
      v-model:modelValue="dialogOpen"
      :title="editingChild ? '编辑孩子' : '添加孩子'"
      max-width-class="sm:max-w-md"
    >
      <div class="space-y-4 py-2">
        <div class="space-y-2">
          <Label for="child-name" class="text-sm font-medium text-[#1F2329]">
            姓名 <span class="text-red-500">*</span>
          </Label>
          <Input
            id="child-name"
            v-model:value="formData.name"
            placeholder="请输入孩子姓名"
            class="rounded-xl"
            autofocus
          />
        </div>
        <div class="space-y-2">
          <Label for="child-avatar" class="text-sm font-medium text-[#1F2329]">
            头像链接（可选）
          </Label>
          <Input
            id="child-avatar"
            v-model:value="formData.avatarUrl"
            placeholder="输入图片URL，留空使用默认头像"
            class="rounded-xl"
          />
          <p class="text-xs text-gray-400">
            提示：可以填入图片链接，或者留空使用默认表情头像
          </p>
        </div>
      </div>

      <template #footer>
        <Button
          variant="outline"
          @click="dialogOpen = false"
          class="rounded-full"
          :disabled="submitting"
        >
          取消
        </Button>
        <Button
          @click="void handleSubmit()"
          class="rounded-full bg-[#FF8A3D] text-white hover:bg-[#FF7A2D]"
          :disabled="submitting || !formData.name.trim()"
        >
          {{ submitting ? '保存中...' : '保存' }}
        </Button>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { Plus, Pencil, Coins, UserPlus } from 'lucide-vue-next';

import { childApi } from '@/api';
import Button from '@/components/ui/Button.vue';
import Dialog from '@/components/ui/Dialog.vue';
import Input from '@/components/ui/Input.vue';
import Label from '@/components/ui/Label.vue';
import Switch from '@/components/ui/Switch.vue';
import type { Child, CreateChildRequest, UpdateChildRequest } from '@shared/api.interface';

interface ChildFormData {
  name: string;
  avatarUrl: string;
}

const children = ref<Child[]>([]);
const loading = ref<boolean>(true);
const error = ref<string | null>(null);

const dialogOpen = ref<boolean>(false);
const editingChild = ref<Child | null>(null);
const formData = ref<ChildFormData>({ name: '', avatarUrl: '' });
const submitting = ref<boolean>(false);

async function fetchChildren(): Promise<void> {
  try {
    loading.value = true;
    error.value = null;
    const result = await childApi.list();
    children.value = result.items;
  } catch (err) {
    logger.error('Failed to fetch children', err as Error);
    error.value = '加载孩子列表失败';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void fetchChildren();
});

function handleAddClick(): void {
  editingChild.value = null;
  formData.value = { name: '', avatarUrl: '' };
  dialogOpen.value = true;
}

function handleEditClick(child: Child): void {
  editingChild.value = child;
  formData.value = {
    name: child.name,
    avatarUrl: child.avatarUrl ?? '',
  };
  dialogOpen.value = true;
}

async function handleSubmit(): Promise<void> {
  if (!formData.value.name.trim()) {
    return;
  }

  try {
    submitting.value = true;
    if (editingChild.value) {
      const body: UpdateChildRequest = {
        name: formData.value.name.trim(),
        avatarUrl: formData.value.avatarUrl || undefined,
      };
      await childApi.update(editingChild.value.id, body);
    } else {
      const body: CreateChildRequest = {
        name: formData.value.name.trim(),
        avatarUrl: formData.value.avatarUrl || undefined,
      };
      await childApi.create(body);
    }
    dialogOpen.value = false;
    void fetchChildren();
  } catch (err) {
    logger.error('Failed to save child', err as Error);
    error.value = '保存失败，请重试';
  } finally {
    submitting.value = false;
  }
}

async function handleToggleActive(child: Child): Promise<void> {
  try {
    await childApi.update(child.id, { isActive: !child.isActive });
    void fetchChildren();
  } catch (err) {
    logger.error('Failed to toggle child active status', err as Error);
  }
}

function getAvatarDisplay(avatarUrl: string | null): string {
  if (avatarUrl) return avatarUrl;
  return '🧒';
}
</script>
