<template>
  <div class="min-h-full bg-[#FFF7E6] p-4 sm:p-6">
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

    <!-- 家庭邀请码（孩子注册用） -->
    <div
      v-if="authStore.loginEnabled && authStore.family?.inviteCode"
      class="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-md"
    >
      <div>
        <p class="text-sm font-semibold text-[#1F2329]">家庭邀请码</p>
        <p class="mt-1 text-xs text-gray-500">
          孩子或另一位家长在登录页「注册」时填入此邀请码，即可加入本家庭（家长权限与您相同）
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span
          class="rounded-xl bg-orange-50 px-4 py-2 font-mono text-xl font-bold tracking-widest text-[#FF8A3D]"
        >
          {{ authStore.family.inviteCode }}
        </span>
        <Button
          size="sm"
          variant="outline"
          class="rounded-full"
          @click="copyInviteCode"
        >
          复制
        </Button>
      </div>
    </div>

    <!-- 家长账号：同一家庭可以有多个家长（爸爸/妈妈…） -->
    <div
      v-if="authStore.loginEnabled && !authStore.isChild()"
      class="mb-6 rounded-2xl bg-white p-4 shadow-md"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-[#1F2329]">家长账号</p>
          <p class="mt-1 text-xs text-gray-500">
            给家里其他大人（如妈妈）建一个账号，登录后可管理本家庭所有孩子的任务、积分与奖励
          </p>
        </div>
        <Button
          size="sm"
          class="rounded-full bg-[#FF8A3D] text-white hover:bg-[#FF7A2D]"
          @click="openParentDialog()"
        >
          <Plus class="h-4 w-4" />
          添加家长账号
        </Button>
      </div>
      <div v-if="parentAccounts.length > 0" class="mt-3 flex flex-wrap gap-2">
        <div
          v-for="account in parentAccounts"
          :key="account.id"
          class="flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1.5"
        >
          <span class="text-sm font-medium text-[#1F2329]">
            {{ account.displayName }}
          </span>
          <span class="text-xs text-gray-500">{{ account.username }}</span>
          <button
            type="button"
            class="text-xs text-[#FF8A3D] transition-colors hover:underline"
            @click="openParentDialog(account)"
          >
            重置密码
          </button>
        </div>
      </div>
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
            <div class="mt-2 flex items-center justify-between text-sm">
              <span v-if="accountFor(child.id)" class="text-gray-500">
                账号
                <span class="font-medium text-[#1F2329]">{{ accountFor(child.id) }}</span>
              </span>
              <span v-else class="text-gray-400">未开通登录账号</span>
              <button
                type="button"
                class="rounded-full border border-orange-200 px-2.5 py-1 text-xs text-[#FF8A3D] transition-colors hover:bg-orange-50"
                @click="openAccountDialog(child)"
              >
                {{ accountFor(child.id) ? '重置密码' : '创建账号' }}
              </button>
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

    <!-- 孩子登录账号 -->
    <Dialog
      v-model:modelValue="accountDialogOpen"
      :title="accountFor(accountChild?.id) ? '重置孩子密码' : '为孩子创建账号'"
      max-width-class="sm:max-w-sm"
    >
      <div class="space-y-4">
        <p class="text-sm text-gray-500">
          为孩子「{{ accountChild?.name }}」设置登录账号，孩子用它登录孩子端（只能看自己的任务）。
        </p>
        <div class="space-y-2">
          <Label class="text-sm font-medium text-[#1F2329]">用户名</Label>
          <Input
            v-model:value="accountForm.username"
            placeholder="2-20 位，支持中文/字母/数字/下划线"
            class="rounded-xl"
          />
        </div>
        <div class="space-y-2">
          <Label class="text-sm font-medium text-[#1F2329]">密码</Label>
          <Input
            v-model:value="accountForm.password"
            type="password"
            placeholder="至少 6 位"
            class="rounded-xl"
          />
        </div>
      </div>
      <template #footer>
        <Button
          variant="outline"
          class="rounded-full"
          :disabled="accountSubmitting"
          @click="accountDialogOpen = false"
        >
          取消
        </Button>
        <Button
          class="rounded-full bg-[#FF8A3D] text-white hover:bg-[#FF7A2D]"
          :disabled="accountSubmitting"
          @click="void handleSaveAccount()"
        >
          {{ accountSubmitting ? '保存中...' : '保存' }}
        </Button>
      </template>
    </Dialog>

    <!-- 家长账号 -->
    <Dialog
      v-model:modelValue="parentDialogOpen"
      :title="parentForm.userId ? '重置家长密码' : '添加家长账号'"
      max-width-class="sm:max-w-sm"
    >
      <div class="space-y-4">
        <p class="text-sm text-gray-500">
          家长账号登录后进入家长端，可以管理本家庭所有孩子的任务、积分与奖励。
        </p>
        <div class="space-y-2">
          <Label class="text-sm font-medium text-[#1F2329]">用户名</Label>
          <Input
            v-model:value="parentForm.username"
            placeholder="2-20 位，支持中文/字母/数字/下划线"
            class="rounded-xl"
          />
        </div>
        <div class="space-y-2">
          <Label class="text-sm font-medium text-[#1F2329]">密码</Label>
          <Input
            v-model:value="parentForm.password"
            type="password"
            placeholder="至少 6 位"
            class="rounded-xl"
          />
        </div>
        <div class="space-y-2">
          <Label class="text-sm font-medium text-[#1F2329]">称呼（可选）</Label>
          <Input
            v-model:value="parentForm.displayName"
            placeholder="如：妈妈"
            class="rounded-xl"
          />
        </div>
      </div>
      <template #footer>
        <Button
          variant="outline"
          class="rounded-full"
          :disabled="parentSubmitting"
          @click="parentDialogOpen = false"
        >
          取消
        </Button>
        <Button
          class="rounded-full bg-[#FF8A3D] text-white hover:bg-[#FF7A2D]"
          :disabled="parentSubmitting"
          @click="void handleSaveParent()"
        >
          {{ parentSubmitting ? '保存中...' : '保存' }}
        </Button>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { Plus, Pencil, Coins, UserPlus } from 'lucide-vue-next';

import { childApi, authApi } from '@/api';
import Button from '@/components/ui/Button.vue';
import { toast } from '@/components/ui/toast';
import { getErrorMessage } from '@/utils/error';
import { useAuthStore } from '@/stores/auth';
import Dialog from '@/components/ui/Dialog.vue';
import Input from '@/components/ui/Input.vue';
import Label from '@/components/ui/Label.vue';
import Switch from '@/components/ui/Switch.vue';
import type { Child, CreateChildRequest, UpdateChildRequest, ParentAccount } from '@shared/api.interface';

interface ChildFormData {
  name: string;
  avatarUrl: string;
}

const children = ref<Child[]>([]);
const authStore = useAuthStore();

// 孩子登录账号（childId -> username）
const accounts = ref<Record<string, string>>({});
const parentAccounts = ref<ParentAccount[]>([]);
const parentDialogOpen = ref<boolean>(false);
const parentSubmitting = ref<boolean>(false);
const parentForm = reactive({
  userId: '',
  username: '',
  password: '',
  displayName: '',
});
const accountDialogOpen = ref<boolean>(false);
const accountChild = ref<Child | null>(null);
const accountSubmitting = ref<boolean>(false);
const accountForm = reactive({ username: '', password: '' });
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
  void fetchAccounts();
  void fetchParentAccounts();
});

/** 家长账号列表（同一家庭可有多个家长） */
async function fetchParentAccounts(): Promise<void> {
  if (!authStore.loginEnabled || authStore.isChild()) return;
  try {
    const result = await authApi.listParentAccounts();
    parentAccounts.value = result.items;
  } catch (error) {
    logger.error('获取家长账号失败', error);
  }
}

function openParentDialog(account?: ParentAccount): void {
  parentForm.userId = account?.id ?? '';
  parentForm.username = account?.username ?? '';
  parentForm.displayName = account?.displayName ?? '';
  parentForm.password = '';
  parentDialogOpen.value = true;
}

async function handleSaveParent(): Promise<void> {
  const username = parentForm.username.trim();
  if (!username) {
    toast.error('请填写用户名');
    return;
  }
  if (parentForm.password.length < 6) {
    toast.error('密码至少 6 位');
    return;
  }
  parentSubmitting.value = true;
  try {
    await authApi.saveParentAccount({
      userId: parentForm.userId || undefined,
      username,
      password: parentForm.password,
      displayName: parentForm.displayName.trim() || undefined,
    });
    toast.success(parentForm.userId ? '密码已重置' : '家长账号已创建');
    parentDialogOpen.value = false;
    await fetchParentAccounts();
  } catch (error) {
    logger.error('保存家长账号失败', error);
    toast.error(getErrorMessage(error, '保存失败，请重试'));
  } finally {
    parentSubmitting.value = false;
  }
}

function accountFor(childId: string | undefined): string | undefined {
  return childId ? accounts.value[childId] : undefined;
}

async function fetchAccounts(): Promise<void> {
  if (!authStore.loginEnabled || authStore.isChild()) return;
  try {
    const result = await authApi.listChildAccounts();
    const map: Record<string, string> = {};
    for (const item of result.items) map[item.childId] = item.username;
    accounts.value = map;
  } catch (error) {
    logger.error('获取孩子账号失败', error);
  }
}

function openAccountDialog(child: Child): void {
  accountChild.value = child;
  accountForm.username = accounts.value[child.id] ?? '';
  accountForm.password = '';
  accountDialogOpen.value = true;
}

async function handleSaveAccount(): Promise<void> {
  if (!accountChild.value) return;
  if (!accountForm.username.trim() || !accountForm.password) {
    toast.error('请填写用户名和密码');
    return;
  }
  accountSubmitting.value = true;
  try {
    await authApi.saveChildAccount({
      childId: accountChild.value.id,
      username: accountForm.username.trim(),
      password: accountForm.password,
    });
    toast.success('账号已保存');
    accountDialogOpen.value = false;
    await fetchAccounts();
  } catch (error) {
    logger.error('保存孩子账号失败', error);
    toast.error(getErrorMessage(error, '保存失败，请重试'));
  } finally {
    accountSubmitting.value = false;
  }
}

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

function copyInviteCode(): void {
  const code = authStore.family?.inviteCode;
  if (!code) return;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(code).then(
      () => toast.success('邀请码已复制'),
      () => toast.info(`邀请码：${code}`),
    );
  } else {
    toast.info(`邀请码：${code}`);
  }
}
</script>
