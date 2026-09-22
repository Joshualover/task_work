/**
 * 角色访问策略：孩子账号只能访问下列接口，其余一律 403。
 */

/** 孩子端页面路由（直接访问这些路径时放行，交给前端路由/视图渲染） */
const CHILD_PAGES = [
  '/child-dashboard',
  '/child-pomodoro',
  '/child-history',
  '/child-points',
  '/child-rewards',
  '/child-allowance',
];

export function isChildPage(path: string): boolean {
  return CHILD_PAGES.some((p) => path === p || path.startsWith(`${p}/`));
}
const CHILD_ALLOWED: Array<{ method: string; re: RegExp }> = [
  { method: 'GET', re: /^\/api\/auth\/(me|config)$/ },
  { method: 'POST', re: /^\/api\/auth\/logout$/ },
  { method: 'POST', re: /^\/api\/auth\/password$/ },
  // 任务：仅查看与提交
  { method: 'GET', re: /^\/api\/tasks$/ },
  // 单条任务（排除 templates 等保留段）
  { method: 'GET', re: /^\/api\/tasks\/(?!templates$|generate-daily$|homework$)[^/]+$/ },
  { method: 'POST', re: /^\/api\/tasks\/[^/]+\/submit$/ },
  // 多选批量提交
  { method: 'POST', re: /^\/api\/tasks\/batch-submit$/ },
  // 目标型任务：记录进度
  { method: 'POST', re: /^\/api\/tasks\/[^/]+\/goal-progress$/ },
  // 积分：仅查看
  { method: 'GET', re: /^\/api\/points\/(balance|transactions)$/ },
  { method: 'GET', re: /^\/api\/points\/transactions\/[^/]+$/ },
  // 奖励：仅查看与兑换
  { method: 'GET', re: /^\/api\/rewards$/ },
  { method: 'GET', re: /^\/api\/rewards\/[^/]+$/ },
  { method: 'GET', re: /^\/api\/redemptions$/ },
  { method: 'GET', re: /^\/api\/redemptions\/[^/]+$/ },
  { method: 'POST', re: /^\/api\/redemptions$/ },
  // 零花钱：查看余额/流水/申请，发起申请
  { method: 'GET', re: /^\/api\/allowance\/(balance|transactions|requests)$/ },
  { method: 'POST', re: /^\/api\/allowance\/requests$/ },
  // 作业子任务：查看与勾选
  { method: 'GET', re: /^\/api\/ai\/suggestions$/ },
  { method: 'POST', re: /^\/api\/ai\/suggestions\/[^/]+\/subtasks\/[^/]+\/toggle$/ },
];

export function isChildAllowed(method: string, path: string): boolean {
  return CHILD_ALLOWED.some((r) => r.method === method && r.re.test(path));
}
