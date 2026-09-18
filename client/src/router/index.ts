import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from 'vue-router';

const Layout = () => import('@/components/Layout.vue');

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
const NotFound = () => import('@/pages/NotFound/NotFound.vue');

const routes: RouteRecordRaw[] = [
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
        path: 'ai-setting',
        name: 'AiSetting',
        component: AiSettingPage,
        meta: { mode: 'parent' },
      },

      // ==================== 孩子端 ====================
      // 孩子端复用 PointsPage / RewardsPage，必须显式传入 mode='child'，
      // 否则组件内默认 mode='parent'，孩子会看到家长管理界面且无法兑换。
      {
        path: 'child-dashboard',
        name: 'ChildDashboard',
        component: ChildDashboardPage,
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

export default router;
