<template>
  <div
    class="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#FFE9CC] to-[#FFF7E6] p-4"
  >
    <div class="w-full max-w-md">
      <div class="mb-6 text-center">
        <div
          class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FF8A3D] text-white shadow-lg"
        >
          <Coins class="h-7 w-7" />
        </div>
        <h1 class="mt-4 text-2xl font-bold text-[#1F2329]">小学生任务积分系统</h1>
        <p class="mt-1 text-sm text-gray-500">家长与孩子一起管理每日任务与积分</p>
      </div>

      <div class="rounded-2xl bg-white p-6 shadow-xl">
        <!-- Tab -->
        <div class="mb-5 flex rounded-full bg-orange-50 p-1">
          <button
            v-for="t in TABS"
            :key="t.value"
            type="button"
            class="flex-1 rounded-full px-4 py-2 text-sm font-medium transition-colors"
            :class="
              tab === t.value
                ? 'bg-[#FF8A3D] text-white shadow-md'
                : 'text-gray-600 hover:text-[#FF8A3D]'
            "
            @click="switchTab(t.value)"
          >
            {{ t.label }}
          </button>
        </div>

        <!-- 登录 -->
        <form
          v-if="tab === 'login'"
          class="space-y-4"
          @submit.prevent="handleLogin"
        >
          <div class="space-y-2">
            <Label class="text-sm font-medium text-[#1F2329]">用户名</Label>
            <Input
              v-model:value="loginForm.username"
              placeholder="请输入用户名"
              class="rounded-xl"
            />
          </div>
          <div class="space-y-2">
            <Label class="text-sm font-medium text-[#1F2329]">密码</Label>
            <Input
              v-model:value="loginForm.password"
              type="password"
              placeholder="请输入密码"
              class="rounded-xl"
            />
          </div>
          <Button
            type="submit"
            size="lg"
            class="w-full rounded-full bg-[#FF8A3D] text-white hover:bg-[#FF7A1F]"
            :disabled="submitting"
          >
            {{ submitting ? '登录中...' : '登录' }}
          </Button>
        </form>

        <!-- 注册 -->
        <form v-else class="space-y-4" @submit.prevent="handleRegister">
          <div class="space-y-2">
            <Label class="text-sm font-medium text-[#1F2329]">选择角色</Label>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                class="rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors"
                :class="
                  registerForm.role === 'parent'
                    ? 'border-[#FF8A3D] bg-orange-50 text-[#FF8A3D]'
                    : 'border-gray-200 text-gray-500 hover:border-orange-200'
                "
                @click="registerForm.role = 'parent'"
              >
                我是家长
              </button>
              <button
                type="button"
                class="rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors"
                :class="
                  registerForm.role === 'child'
                    ? 'border-[#36BFFA] bg-blue-50 text-[#36BFFA]'
                    : 'border-gray-200 text-gray-500 hover:border-blue-200'
                "
                @click="registerForm.role = 'child'"
              >
                我是孩子
              </button>
            </div>
            <p class="text-xs text-gray-400">
              {{
                registerForm.role === 'parent'
                  ? '家长注册后会自动创建家庭，并可在「孩子管理」中查看家庭邀请码'
                  : '孩子注册需要家长提供的 6 位家庭邀请码'
              }}
            </p>
          </div>

          <div class="space-y-2">
            <Label class="text-sm font-medium text-[#1F2329]">用户名</Label>
            <Input
              v-model:value="registerForm.username"
              placeholder="3-20 位字母、数字或下划线"
              class="rounded-xl"
            />
          </div>
          <div class="space-y-2">
            <Label class="text-sm font-medium text-[#1F2329]">密码</Label>
            <Input
              v-model:value="registerForm.password"
              type="password"
              placeholder="至少 6 位"
              class="rounded-xl"
            />
          </div>
          <div class="space-y-2">
            <Label class="text-sm font-medium text-[#1F2329]">
              {{ registerForm.role === 'parent' ? '昵称' : '孩子姓名' }}
            </Label>
            <Input
              v-model:value="registerForm.displayName"
              :placeholder="
                registerForm.role === 'parent' ? '如：爸爸 / 妈妈' : '如：小明'
              "
              class="rounded-xl"
            />
          </div>

          <div v-if="registerForm.role === 'parent'" class="space-y-2">
            <Label class="text-sm font-medium text-[#1F2329]">家庭名称（可选）</Label>
            <Input
              v-model:value="registerForm.familyName"
              placeholder="如：我的家庭"
              class="rounded-xl"
            />
          </div>
          <div v-else class="space-y-2">
            <Label class="text-sm font-medium text-[#1F2329]">家庭邀请码</Label>
            <Input
              v-model:value="registerForm.inviteCode"
              placeholder="6 位邀请码，如 AB3K9X"
              class="rounded-xl uppercase"
            />
          </div>

          <Button
            type="submit"
            size="lg"
            class="w-full rounded-full bg-[#FF8A3D] text-white hover:bg-[#FF7A1F]"
            :disabled="submitting"
          >
            {{ submitting ? '注册中...' : '注册并登录' }}
          </Button>
        </form>
      </div>

      <p class="mt-4 text-center text-xs text-gray-400">
        孩子账号登录后只能查看自己的任务，无法进入家长模式
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Coins } from 'lucide-vue-next';
import { logger } from '@lark-apaas/client-toolkit/logger';

import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import Label from '@/components/ui/Label.vue';
import { toast } from '@/components/ui/toast';
import { useAuthStore } from '@/stores/auth';

type Tab = 'login' | 'register';

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'login', label: '登录' },
  { value: 'register', label: '注册' },
];

const router = useRouter();
const authStore = useAuthStore();

const tab = ref<Tab>('login');
const submitting = ref(false);

const loginForm = reactive({ username: '', password: '' });
const registerForm = reactive<{
  role: 'parent' | 'child';
  username: string;
  password: string;
  displayName: string;
  inviteCode: string;
  familyName: string;
}>({
  role: 'parent',
  username: '',
  password: '',
  displayName: '',
  inviteCode: '',
  familyName: '',
});

function switchTab(next: Tab): void {
  tab.value = next;
}

function errorMessage(error: unknown): string {
  const e = error as { response?: { data?: { message?: string } }; message?: string };
  return e?.response?.data?.message || e?.message || '操作失败，请重试';
}

function redirectByRole(role: string): void {
  void router.replace(role === 'child' ? '/child-dashboard' : '/dashboard');
}

async function handleLogin(): Promise<void> {
  if (!loginForm.username.trim() || !loginForm.password) {
    toast.error('请输入用户名和密码');
    return;
  }
  submitting.value = true;
  try {
    const user = await authStore.login(loginForm.username.trim(), loginForm.password);
    toast.success(`欢迎回来，${user.displayName}`);
    redirectByRole(user.role);
  } catch (error) {
    logger.error('登录失败', error);
    toast.error(errorMessage(error));
  } finally {
    submitting.value = false;
  }
}

async function handleRegister(): Promise<void> {
  const f = registerForm;
  if (!f.username.trim() || !f.password) {
    toast.error('请填写用户名和密码');
    return;
  }
  if (f.role === 'child' && !f.inviteCode.trim()) {
    toast.error('请填写家庭邀请码');
    return;
  }
  submitting.value = true;
  try {
    const user = await authStore.register({
      username: f.username.trim(),
      password: f.password,
      displayName: f.displayName.trim() || undefined,
      role: f.role,
      inviteCode: f.role === 'child' ? f.inviteCode.trim().toUpperCase() : undefined,
      familyName: f.role === 'parent' ? f.familyName.trim() || undefined : undefined,
    });
    toast.success('注册成功');
    redirectByRole(user.role);
  } catch (error) {
    logger.error('注册失败', error);
    toast.error(errorMessage(error));
  } finally {
    submitting.value = false;
  }
}
</script>
