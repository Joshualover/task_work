/**
 * 角色访问策略：孩子账号只能访问下列接口，其余一律 403。
 */
const CHILD_ALLOWED: Array<{ method: string; re: RegExp }> = [
  { method: 'GET', re: /^\/api\/auth\/(me|config)$/ },
  { method: 'POST', re: /^\/api\/auth\/logout$/ },
  // 任务：仅查看与提交
  { method: 'GET', re: /^\/api\/tasks$/ },
  // 单条任务（排除 templates 等保留段）
  { method: 'GET', re: /^\/api\/tasks\/(?!templates$|generate-daily$|homework$)[^/]+$/ },
  { method: 'POST', re: /^\/api\/tasks\/[^/]+\/submit$/ },
  // 积分：仅查看
  { method: 'GET', re: /^\/api\/points\/(balance|transactions)$/ },
  { method: 'GET', re: /^\/api\/points\/transactions\/[^/]+$/ },
  // 奖励：仅查看与兑换
  { method: 'GET', re: /^\/api\/rewards$/ },
  { method: 'GET', re: /^\/api\/rewards\/[^/]+$/ },
  { method: 'GET', re: /^\/api\/redemptions$/ },
  { method: 'GET', re: /^\/api\/redemptions\/[^/]+$/ },
  { method: 'POST', re: /^\/api\/redemptions$/ },
  // 作业子任务：查看与勾选
  { method: 'GET', re: /^\/api\/ai\/suggestions$/ },
  { method: 'POST', re: /^\/api\/ai\/suggestions\/[^/]+\/subtasks\/[^/]+\/toggle$/ },
];

export function isChildAllowed(method: string, path: string): boolean {
  return CHILD_ALLOWED.some((r) => r.method === method && r.re.test(path));
}
