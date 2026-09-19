<template>
  <div class="flex h-dvh w-full flex-col bg-[#FFF7E6]">
    <!-- Header -->
    <header
      class="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-orange-100 bg-white px-3 shadow-sm sm:h-16 sm:px-4 lg:px-6"
    >
      <!-- 左：菜单按钮（移动端）+ Logo -->
      <div class="flex min-w-0 items-center gap-2 sm:gap-3">
        <button
          v-if="mode === 'parent'"
          type="button"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-gray-600 transition-colors hover:bg-orange-50 md:hidden"
          aria-label="菜单"
          @click="drawerOpen = true"
        >
          <Menu class="h-5 w-5" />
        </button>
        <div
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FF8A3D] text-white sm:h-9 sm:w-9"
        >
          <Coins class="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
        <span
          class="truncate text-base font-bold text-[#1F2329] sm:text-xl"
        >
          <span class="sm:hidden">积分系统</span>
          <span class="hidden sm:inline">小学生任务积分系统</span>
        </span>
      </div>

      <!-- 右：模式切换（平板+）+ 孩子选择 + 用户菜单 -->
      <div class="flex shrink-0 items-center gap-2 sm:gap-3">
        <!-- 模式切换：md 及以上显示在头部；移动端在抽屉里 -->
        <div
          v-if="!authStore.isChild()"
          class="hidden rounded-full bg-orange-50 p-1 md:flex"
        >
          <button
            type="button"
            @click="handleModeChange('parent')"
            :class="[
              'rounded-full px-3 py-1.5 text-sm font-medium transition-colors lg:px-4',
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
              'rounded-full px-3 py-1.5 text-sm font-medium transition-colors lg:px-4',
              mode === 'child'
                ? 'bg-[#36BFFA] text-white shadow-md'
                : 'text-gray-600 hover:text-[#36BFFA]',
            ]"
          >
            孩子模式
          </button>
        </div>

        <!-- 孩子选择器 -->
        <div v-if="!authStore.isChild()" class="relative">
          <button
            type="button"
            @click="toggleChildDropdown"
            :disabled="childStore.loading || childStore.children.length === 0"
            class="flex max-w-[8rem] items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1.5 text-sm font-medium text-[#1F2329] transition-colors hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-none sm:gap-2 sm:px-3"
          >
            <span class="text-lg">
              {{ childStore.currentChild ? getAvatarDisplay(childStore.currentChild.avatarUrl) : '👤' }}
            </span>
            <span class="truncate">
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
                'h-4 w-4 shrink-0 text-gray-500 transition-transform',
                childDropdownOpen ? 'rotate-180' : '',
              ]"
            />
          </button>
          <div
            v-if="childDropdownOpen && childStore.children.length > 0"
            class="absolute right-0 top-full z-50 mt-2 w-40 overflow-hidden rounded-2xl bg-white py-1 shadow-lg ring-1 ring-orange-100"
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
              <span class="truncate font-medium">{{ child.name }}</span>
            </button>
          </div>
        </div>
        <span v-else class="text-sm font-medium text-[#1F2329]">
          {{ childStore.currentChild?.name ?? authStore.user?.displayName }}
        </span>

        <!-- 用户菜单 -->
        <div v-if="authStore.loginEnabled" class="relative">
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1.5 text-sm font-medium text-[#1F2329] transition-colors hover:bg-orange-100"
            @click="toggleUserMenu"
          >
            <UserRound class="h-4 w-4 text-[#FF8A3D]" />
            <span class="hidden max-w-[6rem] truncate lg:inline">
              {{ authStore.user?.displayName }}
            </span>
            <ChevronDown
              :class="[
                'h-4 w-4 text-gray-500 transition-transform',
                userMenuOpen ? 'rotate-180' : '',
              ]"
            />
          </button>
          <div
            v-if="userMenuOpen"
            class="absolute right-0 top-full z-50 mt-2 w-36 overflow-hidden rounded-2xl bg-white py-1 shadow-lg ring-1 ring-orange-100"
          >
            <button
              type="button"
              class="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-[#1F2329] transition-colors hover:bg-orange-50"
              @click="openChangePassword"
            >
              <KeyRound class="h-4 w-4 text-gray-400" />
              修改密码
            </button>
            <button
              type="button"
              class="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-[#FF4D4F] transition-colors hover:bg-red-50"
              @click="void handleLogout()"
            >
              <LogOut class="h-4 w-4" />
              退出登录
            </button>
          </div>
        </div>
      </div>
    </header>

    <div class="flex flex-1 overflow-hidden">
      <!-- 桌面/平板：固定侧边栏（md+） -->
      <aside
        v-if="mode === 'parent'"
        class="hidden w-56 shrink-0 border-r border-orange-100 bg-white p-4 md:block"
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

      <!-- 主内容 -->
      <main class="flex-1 overflow-auto">
        <router-view />
      </main>
    </div>

    <!-- 孩子端底部 Tab（小屏固定到底部） -->
    <nav
      v-if="mode === 'child'"
      class="shrink-0 border-t border-blue-100 bg-white pb-[env(safe-area-inset-bottom)]"
    >
      <div class="mx-auto flex max-w-2xl items-stretch">
        <router-link
          v-for="item in CHILD_TAB_ITEMS"
          :key="item.path"
          :to="item.path"
          class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors"
          active-class="text-[#36BFFA]"
          inactive-class="text-gray-500 hover:text-[#36BFFA]"
        >
          <component
            :is="item.icon"
            :class="['h-5 w-5', $route.path === item.path ? 'text-[#36BFFA]' : '']"
          />
          <span class="text-[10px]">{{ item.label }}</span>
        </router-link>
      </div>
    </nav>

    <!-- 移动端抽屉（< md，家长模式） -->
    <template v-if="mode === 'parent'">
      <div
        v-if="drawerOpen"
        class="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
        @click="drawerOpen = false"
      />
      <aside
        :class="[
          'fixed left-0 top-0 z-50 flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-xl transition-transform duration-200 md:hidden',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
        ]"
      >
        <div class="flex items-center gap-3 border-b border-orange-100 px-4 py-4">
          <div
            class="flex h-9 w-9 items-center justify-center rounded-full bg-[#FF8A3D] text-white"
          >
            <Coins class="h-5 w-5" />
          </div>
          <div class="min-w-0">
            <p class="truncate text-sm font-bold text-[#1F2329]">
              小学生任务积分系统
            </p>
            <p class="truncate text-xs text-gray-400">
              {{ authStore.user?.displayName }}
            </p>
          </div>
        </div>

        <!-- 模式切换（移动端） -->
        <div
          v-if="!authStore.isChild()"
          class="flex gap-2 border-b border-orange-100 p-4"
        >
          <button
            type="button"
            class="flex-1 rounded-full px-3 py-2 text-sm font-medium transition-colors"
            :class="
              mode === 'parent'
                ? 'bg-[#FF8A3D] text-white shadow-md'
                : 'bg-orange-50 text-gray-600'
            "
            @click="handleModeChange('parent')"
          >
            家长模式
          </button>
          <button
            type="button"
            class="flex-1 rounded-full px-3 py-2 text-sm font-medium transition-colors"
            :class="
              mode === 'child'
                ? 'bg-[#36BFFA] text-white shadow-md'
                : 'bg-orange-50 text-gray-600'
            "
            @click="handleModeChange('child')"
          >
            孩子模式
          </button>
        </div>

        <nav class="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          <router-link
            v-for="item in PARENT_NAV_ITEMS"
            :key="item.path"
            :to="item.path"
            class="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors"
            active-class="bg-[#FF8A3D] text-white shadow-md"
            inactive-class="text-gray-600 hover:bg-orange-50 hover:text-[#FF8A3D]"
            @click="drawerOpen = false"
          >
            <component :is="item.icon" class="h-5 w-5" />
            <span>{{ item.label }}</span>
          </router-link>
        </nav>

        <div class="border-t border-orange-100 p-3">
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-[#1F2329] transition-colors hover:bg-orange-50"
            @click="openChangePassword"
          >
            <KeyRound class="h-5 w-5 text-gray-400" />
            修改密码
          </button>
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-[#FF4D4F] transition-colors hover:bg-red-50"
            @click="void handleLogout()"
          >
            <LogOut class="h-5 w-5" />
            退出登录
          </button>
        </div>
      </aside>
    </template>

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
import { ref, reactive, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
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
  Timer,
  CalendarDays,
  PiggyBank,
  ChevronDown,
  Menu,
  UserRound,
  KeyRound,
  LogOut,
} from 'lucide-vue-next';
import { useChildStore } from '@/stores/child';
import { useAuthStore } from '@/stores/auth';
import Dialog from '@/components/ui/Dialog.vue';
import Input from '@/components/ui/Input.vue';
import Label from '@/components/ui/Label.vue';
import Button from '@/components/ui/Button.vue';
import { toast } from '@/components/ui/toast';
import { getErrorMessage } from '@/utils/error';

type UserMode = 'parent' | 'child';

const PARENT_NAV_ITEMS = [
  { path: '/dashboard', label: '概览', icon: LayoutDashboard },
  { path: '/children', label: '孩子管理', icon: Users },
  { path: '/task-templates', label: '任务配置', icon: ClipboardList },
  { path: '/tasks', label: '作业任务池', icon: BookOpen },
  { path: '/points', label: '积分流水', icon: Coins },
  { path: '/rewards', label: '奖励管理', icon: Gift },
  { path: '/allowance', label: '零花钱', icon: PiggyBank },
  { path: '/redemption', label: '兑换审核', icon: CheckCircle2 },
  { path: '/report', label: '报表统计', icon: BarChart3 },
  { path: '/history', label: '任务记录', icon: CalendarDays },
  { path: '/ai-setting', label: 'AI 设置', icon: Sparkles },
];

const CHILD_TAB_ITEMS = [
  { path: '/child-dashboard', label: '任务', icon: Home },
  { path: '/child-pomodoro', label: '番茄', icon: Timer },
  { path: '/child-history', label: '记录', icon: CalendarDays },
  { path: '/child-points', label: '积分', icon: Wallet },
  { path: '/child-rewards', label: '兑换', icon: ShoppingBag },
  { path: '/child-allowance', label: '零花钱', icon: PiggyBank },
];

const route = useRoute();
const router = useRouter();
const childStore = useChildStore();
const authStore = useAuthStore();

const mode = ref<UserMode>('parent');
const childDropdownOpen = ref<boolean>(false);
const userMenuOpen = ref<boolean>(false);
const drawerOpen = ref<boolean>(false);

watch(
  () => route.path,
  (newPath: string) => {
    // 所有孩子端路由统一以 /child- 开头（见 router：ChildDashboard / ChildPoints / ChildRewards）
    mode.value = newPath.startsWith('/child-') ? 'child' : 'parent';
    drawerOpen.value = false;
    childDropdownOpen.value = false;
    userMenuOpen.value = false;
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

function toggleChildDropdown(): void {
  userMenuOpen.value = false;
  childDropdownOpen.value = !childDropdownOpen.value;
}

function toggleUserMenu(): void {
  childDropdownOpen.value = false;
  userMenuOpen.value = !userMenuOpen.value;
}

function openChangePassword(): void {
  userMenuOpen.value = false;
  drawerOpen.value = false;
  pwdDialogOpen.value = true;
}

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
    toast.error(getErrorMessage(error, '修改失败，请重试'));
  } finally {
    pwdSubmitting.value = false;
  }
}

function handleModeChange(newMode: UserMode): void {
  mode.value = newMode;
  drawerOpen.value = false;
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
