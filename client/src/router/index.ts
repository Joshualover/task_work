import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const Layout = () => import('@/components/Layout.vue');
const LoginPage = () => import('@/pages/login/LoginPage.vue');

const ParentDashboardPage = () =>
  import('@/pages/parent-dashboard/ParentDashboardPage.vue');
const ChildManagePage = () =>
  import('@/pages/child-manage/ChildManagePage.vue');
const TaskTemplatesPage = () =>
  import('@/pages/task-templates/TaskTemplatesPage.vue');
const TasksPage = () => import('@/pages/tasks/TasksPage.vue');
const PointsPage = () => import('@/pages/points/PointsPage.vue');
const RewardsPage = () => import('@/pages/rewards/RewardsPage.vue');
const RedemptionPage = () => import('@/pages/redemption/RedemptionPage.vue');
const ReportPage = () => import('@/pages/report/ReportPage.vue');
const AiSettingPage = () => import('@/pages/ai-setting/AiSettingPage.vue');
const ChildDashboardPage = () =>
  import('@/pages/child-dashboard/ChildDashboardPage.vue');
const PomodoroPage = () => import('@/pages/pomodoro/PomodoroPage.vue');
const TaskHistoryPage = () => import('@/pages/history/TaskHistoryPage.vue');
const AllowancePage = () => import('@/pages/allowance/AllowancePage.vue');
const NotFound = () => import('@/pages/NotFound/NotFound.vue');

/** 孩子账号可访问的页面 */
const CHILD_ROUTES = [
  '/child-dashboard',
  '/child-pomodoro',
  '/child-history',
  '/child-points',
  '/child-rewards',
  '/child-allowance',
];

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: LoginPage,
    meta: { public: true },
  },
  {
    path: '/',
    redirect: '/dashboard',
  },
  {
    path: '/',
    component: Layout,
    children: [
      // ==================== 家长端 ====================
      {
        path: 'dashboard',
        name: 'ParentDashboard',
        component: ParentDashboardPage,
        meta: { mode: 'parent' },
      },
      {
        path: 'children',
        name: 'ChildManage',
        component: ChildManagePage,
        meta: { mode: 'parent' },
      },
      {
        path: 'task-templates',
        name: 'TaskTemplates',
        component: TaskTemplatesPage,
        meta: { mode: 'parent' },
      },
      {
        path: 'tasks',
        name: 'Tasks',
        component: TasksPage,
        meta: { mode: 'parent' },
      },
      {
        path: 'points',
        name: 'Points',
        component: PointsPage,
        props: { mode: 'parent' },
        meta: { mode: 'parent' },
      },
      {
        path: 'rewards',
        name: 'Rewards',
        component: RewardsPage,
        props: { mode: 'parent' },
        meta: { mode: 'parent' },
      },
      {
        path: 'allowance',
        name: 'Allowance',
        component: AllowancePage,
        props: { mode: 'parent' },
        meta: { mode: 'parent' },
      },
      {
        path: 'redemption',
        name: 'Redemption',
        component: RedemptionPage,
        props: { mode: 'parent' },
        meta: { mode: 'parent' },
      },
      {
        path: 'report',
        name: 'Report',
        component: ReportPage,
        meta: { mode: 'parent' },
      },
      {
        path: 'history',
        name: 'TaskHistory',
        component: TaskHistoryPage,
        props: { mode: 'parent' },
        meta: { mode: 'parent' },
      },
      {
        path: 'ai-setting',
        name: 'AiSetting',
        component: AiSettingPage,
        meta: { mode: 'parent' },
      },

      // ==================== 孩子端 ====================
      {
        path: 'child-dashboard',
        name: 'ChildDashboard',
        component: ChildDashboardPage,
        meta: { mode: 'child' },
      },
      {
        path: 'child-pomodoro',
        name: 'ChildPomodoro',
        component: PomodoroPage,
        meta: { mode: 'child' },
      },
      {
        path: 'child-history',
        name: 'ChildHistory',
        component: TaskHistoryPage,
        props: { mode: 'child' },
        meta: { mode: 'child' },
      },
      {
        path: 'child-points',
        name: 'ChildPoints',
        component: PointsPage,
        props: { mode: 'child' },
        meta: { mode: 'child' },
      },
      {
        path: 'child-rewards',
        name: 'ChildRewards',
        component: RewardsPage,
        props: { mode: 'child' },
        meta: { mode: 'child' },
      },
      {
        path: 'child-allowance',
        name: 'ChildAllowance',
        component: AllowancePage,
        props: { mode: 'child' },
        meta: { mode: 'child' },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: NotFound,
  },
];

const router = createRouter({
  history: createWebHistory(process.env.CLIENT_BASE_PATH || '/'),
  routes,
});

// 登录与角色守卫
router.beforeEach((to) => {
  const auth = useAuthStore();

  // 未启用应用登录（平台托管登录）：不干预
  if (!auth.loginEnabled) return true;

  if (to.path === '/login') {
    if (auth.user) {
      return { path: auth.user.role === 'child' ? '/child-dashboard' : '/dashboard' };
    }
    return true;
  }

  if (!auth.user) return { path: '/login' };

  // 孩子账号只能访问孩子端页面
  if (auth.user.role === 'child' && !CHILD_ROUTES.includes(to.path)) {
    return { path: '/child-dashboard' };
  }

  return true;
});

export default router;
