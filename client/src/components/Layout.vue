<template>
  <div class="flex h-screen w-screen flex-col bg-[#FFF7E6]">
    <!-- Header -->
    <header
      class="flex h-16 shrink-0 items-center justify-between border-b border-orange-100 bg-white px-6 shadow-sm"
    >
      <!-- Logo & App Name -->
      <div class="flex items-center gap-3">
        <div
          class="flex h-9 w-9 items-center justify-center rounded-full bg-[#FF8A3D] text-white"
        >
          <Coins class="h-5 w-5" />
        </div>
        <span class="text-xl font-bold text-[#1F2329]">小学生任务积分系统</span>
      </div>

      <!-- Mode Switch & Child Selector & User -->
      <div class="flex items-center gap-4">
        <!-- Mode Switch（孩子账号不可见，禁止进入家长模式） -->
        <div v-if="!authStore.isChild()" class="flex rounded-full bg-orange-50 p-1">
          <button
            type="button"
            @click="handleModeChange('parent')"
            :class="[
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              mode === 'parent'
                ? 'bg-[#FF8A3D] text-white shadow-md'
                : 'text-gray-600 hover:text-[#FF8A3D]',
            ]"
          >
            家长模式
          </button>
          <button
            type="button"
            @click="handleModeChange('child')"
            :class="[
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              mode === 'child'
                ? 'bg-[#36BFFA] text-white shadow-md'
                : 'text-gray-600 hover:text-[#36BFFA]',
            ]"
          >
            孩子模式
          </button>
        </div>

        <!-- Child Selector（孩子账号只显示自己，不可切换） -->
        <div v-if="!authStore.isChild()" class="relative">
          <button
            type="button"
            @click="childDropdownOpen = !childDropdownOpen"
            :disabled="childStore.loading || childStore.children.length === 0"
            class="flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1.5 text-sm font-medium text-[#1F2329] transition-colors hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span class="text-lg">
              {{ childStore.currentChild ? getAvatarDisplay(childStore.currentChild.avatarUrl) : '👤' }}
            </span>
            <span>
              {{
                childStore.loading
                  ? '加载中...'
                  : childStore.currentChild
                    ? childStore.currentChild.name
                    : '请先添加孩子'
              }}
            </span>
            <ChevronDown
              :class="[
                'h-4 w-4 text-gray-500 transition-transform',
                childDropdownOpen ? 'rotate-180' : '',
              ]"
            />
          </button>
          <div
            v-if="childDropdownOpen && childStore.children.length > 0"
            class="absolute right-0 top-full z-50 mt-2 w-36 overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-orange-100"
          >
            <button
              v-for="child in childStore.children"
              :key="child.id"
              type="button"
              @click="handleChildSelect(child.id)"
              :class="[
                'flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors',
                child.id === childStore.currentChildId
                  ? 'bg-orange-50 text-[#FF8A3D]'
                  : 'text-[#1F2329] hover:bg-orange-50/50',
              ]"
            >
              <span class="text-base">
                {{ getAvatarDisplay(child.avatarUrl) }}
              </span>
              <span class="font-medium">{{ child.name }}</span>
            </button>
          </div>
        </div>
        <span v-else class="text-sm font-medium text-[#1F2329]">
          {{ childStore.currentChild?.name ?? authStore.user?.displayName }}
        </span>

        <!-- 用户 / 退出 -->
        <div class="flex items-center gap-2">
          <span class="hidden text-sm text-gray-500 sm:inline">
            {{ authStore.user?.displayName }}
          </span>
          <button
            v-if="authStore.loginEnabled"
            type="button"
            class="rounded-full border border-orange-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-orange-50"
            @click="pwdDialogOpen = true"
          >
            修改密码
          </button>
          <button
            v-if="authStore.loginEnabled"
            type="button"
            class="rounded-full border border-orange-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-orange-50"
            @click="void handleLogout()"
          >
            退出
          </button>
        </div>
      </div>
    </header>

    <div class="flex flex-1 overflow-hidden">
      <!-- Parent Sidebar -->
      <aside
        v-if="mode === 'parent'"
        class="w-56 shrink-0 border-r border-orange-100 bg-white p-4"
      >
        <nav class="flex flex-col gap-1">
          <router-link
            v-for="item in PARENT_NAV_ITEMS"
            :key="item.path"
            :to="item.path"
            class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors"
            active-class="bg-[#FF8A3D] text-white shadow-md"
            inactive-class="text-gray-600 hover:bg-orange-50 hover:text-[#FF8A3D]"
          >
            <component :is="item.icon" class="h-5 w-5" />
            <span>{{ item.label }}</span>
          </router-link>
        </nav>
      </aside>

      <!-- Main Content -->
      <main class="flex-1 overflow-auto">
        <router-view />
      </main>
    </div>

    <!-- Child Bottom Tab Bar -->
    <nav
      v-if="mode === 'child'"
      class="shrink-0 border-t border-blue-100 bg-white px-4 py-2"
    >
      <div class="flex items-center justify-around">
        <router-link
          v-for="item in CHILD_TAB_ITEMS"
          :key="item.path"
          :to="item.path"
          class="flex flex-col items-center gap-1 rounded-xl px-6 py-2 text-xs font-medium transition-colors"
          active-class="text-[#36BFFA]"
          inactive-class="text-gray-500 hover:text-[#36BFFA]"
        >
          <component
            :is="item.icon"
            :class="['h-6 w-6', $route.path === item.path ? 'text-[#36BFFA]' : '']"
          />
          <span>{{ item.label }}</span>
        </router-link>
      </div>
    </nav>

    <!-- 修改密码 -->
    <Dialog
      v-model:modelValue="pwdDialogOpen"
      title="修改密码"
      max-width-class="sm:max-w-sm"
    >
      <div class="space-y-4">
        <div class="space-y-2">
          <Label class="text-sm font-medium text-[#1F2329]">原密码</Label>
          <Input
            v-model:value="pwdForm.oldPassword"
            type="password"
            placeholder="请输入原密码"
            class="rounded-xl"
          />
        </div>
        <div class="space-y-2">
          <Label class="text-sm font-medium text-[#1F2329]">新密码</Label>
          <Input
            v-model:value="pwdForm.newPassword"
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
          :disabled="pwdSubmitting"
          @click="pwdDialogOpen = false"
        >
          取消
        </Button>
        <Button
          class="rounded-full bg-[#FF8A3D] text-white hover:bg-[#FF7A2D]"
          :disabled="pwdSubmitting"
          @click="void handleChangePassword()"
        >
          {{ pwdSubmitting ? '提交中...' : '确认修改' }}
        </Button>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted } from 'vue';import { useRoute, useRouter } from 'vue-router';
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  BookOpen,
  Coins,
  Gift,
  CheckCircle2,
  BarChart3,
  Sparkles,
  Home,
  Wallet,
  ShoppingBag,
  ChevronDown,
} from 'lucide-vue-next';
import { useChildStore } from '@/stores/child';
import { useAuthStore } from '@/stores/auth';
import Dialog from '@/components/ui/Dialog.vue';
import Input from '@/components/ui/Input.vue';
import Label from '@/components/ui/Label.vue';
import Button from '@/components/ui/Button.vue';
import { toast } from '@/components/ui/toast';

type UserMode = 'parent' | 'child';

const PARENT_NAV_ITEMS = [
  { path: '/dashboard', label: '概览', icon: LayoutDashboard },
  { path: '/children', label: '孩子管理', icon: Users },
  { path: '/task-templates', label: '任务配置', icon: ClipboardList },
  { path: '/tasks', label: '作业任务池', icon: BookOpen },
  { path: '/points', label: '积分流水', icon: Coins },
  { path: '/rewards', label: '奖励管理', icon: Gift },
  { path: '/redemption', label: '兑换审核', icon: CheckCircle2 },
  { path: '/report', label: '报表统计', icon: BarChart3 },
  { path: '/ai-setting', label: 'AI 设置', icon: Sparkles },
];

const CHILD_TAB_ITEMS = [
  { path: '/child-dashboard', label: '今日任务', icon: Home },
  { path: '/child-points', label: '积分', icon: Wallet },
  { path: '/child-rewards', label: '兑换', icon: ShoppingBag },
];

const route = useRoute();
const router = useRouter();
const childStore = useChildStore();
const authStore = useAuthStore();

const mode = ref<UserMode>('parent');
const childDropdownOpen = ref<boolean>(false);

watch(
  () => route.path,
  (newPath: string) => {
    // 所有孩子端路由统一以 /child- 开头（见 router：ChildDashboard / ChildPoints / ChildRewards）
    mode.value = newPath.startsWith('/child-') ? 'child' : 'parent';
  },
  { immediate: true },
);

onMounted(() => {
  if (authStore.isChild()) {
    // 孩子账号：只有自己一个孩子，且不可切换
    if (authStore.child) {
      childStore.setChildren([authStore.child], authStore.child.id);
    }
  } else {
    void childStore.fetchChildren();
  }
});

async function handleLogout(): Promise<void> {
  await authStore.logout();
  void router.replace('/login');
}

const pwdDialogOpen = ref<boolean>(false);
const pwdSubmitting = ref<boolean>(false);
const pwdForm = reactive({ oldPassword: '', newPassword: '' });

async function handleChangePassword(): Promise<void> {
  if (!pwdForm.oldPassword || !pwdForm.newPassword) {
    toast.error('请填写原密码和新密码');
    return;
  }
  if (pwdForm.newPassword.length < 6) {
    toast.error('新密码至少 6 位');
    return;
  }
  pwdSubmitting.value = true;
  try {
    await authStore.changePassword(pwdForm.oldPassword, pwdForm.newPassword);
    toast.success('密码已修改');
    pwdDialogOpen.value = false;
    pwdForm.oldPassword = '';
    pwdForm.newPassword = '';
  } catch (error) {
    const e = error as { response?: { data?: { message?: string } } };
    toast.error(e?.response?.data?.message || '修改失败，请重试');
  } finally {
    pwdSubmitting.value = false;
  }
}

function handleModeChange(newMode: UserMode): void {
  mode.value = newMode;
  if (newMode === 'parent') {
    void router.push('/dashboard');
  } else {
    void router.push('/child-dashboard');
  }
}

function handleChildSelect(childId: string): void {
  childStore.setCurrentChildId(childId);
  childDropdownOpen.value = false;
}

function getAvatarDisplay(avatarUrl: string | null): string {
  if (avatarUrl) return avatarUrl;
  return '🧒';
}
</script>
