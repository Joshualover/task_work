/**
 * 「孩子端任务分组」回归：用真实业务流造出全部 5 种任务状态，再拉真实接口数据，
 * 用**组件同一份**分组函数（shared/task-groups.ts）断言分档结果。
 *
 * 为什么能验证到组件逻辑：分组规则已抽到 shared/task-groups.ts，组件与脚本
 * import 同一个函数。若规则仍内联在 .vue 里，这个脚本就只能验证数据形状。
 *
 * 用法：
 *   1) bash scripts/dev-local.sh start           # 或 node scripts/dev-pglite-db.mjs 另起服务
 *   2) node scripts/test-progress-grouping.mjs
 *      （脚本会自行以 --experimental-strip-types 重执行，无需手加 flag）
 *
 * 可用环境变量：
 *   E2E_BASE_URL   被测服务地址（默认 http://localhost:8080）
 *
 * 说明：本脚本只用 HTTP + 纯函数，**不需要浏览器**，因此也不受
 * PGlite 并发限制影响（请求是串行的）。
 */
import { spawnSync } from 'node:child_process';

// 需要 TS 类型擦除以 import shared/task-groups.ts
if (!process.execArgv.some((a) => a.includes('strip-types'))) {
  const r = spawnSync(
    process.execPath,
    ['--experimental-strip-types', ...process.argv.slice(1)],
    { stdio: 'inherit' },
  );
  process.exit(r.status ?? 1);
}

const {
  buildTaskGroups,
  sortOverdueFirst,
  PROGRESS_BUCKETS,
  TASK_CATEGORIES,
  TASK_STATUSES,
} = await import('../shared/task-groups.ts');

const BASE = process.env.E2E_BASE_URL || 'http://localhost:8080';
const day = (off = 0) => new Date(Date.now() + 8 * 3600e3 + off * 86400e3).toISOString().slice(0, 10);

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  if (cond) {
    pass += 1;
    console.log(`   ✅ ${msg}`);
  } else {
    fail += 1;
    console.log(`   ❌ ${msg}`);
  }
};

function makeClient() {
  let cookie = '';
  return async function req(method, path, body, opts = {}) {
    const headers = { Accept: 'application/json' };
    if (cookie) headers['Cookie'] = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(BASE + path, {
      method,
      headers,
      redirect: 'manual',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const kv = c.split(';')[0];
      const k = kv.split('=')[0];
      if (cookie) cookie = cookie.split('; ').filter((x) => !x.startsWith(k + '=')).join('; ');
      cookie = cookie ? cookie + '; ' + kv : kv;
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    if (res.status >= 400 && !opts.expectError) {
      console.log(`   ⚠️  ${method} ${path} -> ${res.status}`, JSON.stringify(json).slice(0, 200));
    }
    return { status: res.status, json };
  };
}

const stamp = String(Date.now()).slice(-8);
const PWD = 'test1234';

(async () => {
  // ==================== A. 分档定义自身的完整性（无需后端） ====================
  console.log('\n【A】分档定义完整性');
  const covered = PROGRESS_BUCKETS.flatMap((b) => b.statuses);
  const uncovered = TASK_STATUSES.filter((s) => !covered.includes(s));
  const duplicated = TASK_STATUSES.filter((s) => covered.filter((c) => c === s).length > 1);
  ok(uncovered.length === 0, `每个状态都被某一档覆盖（未覆盖: ${uncovered.join(',') || '无'}）`);
  ok(duplicated.length === 0, `每个状态只属于一档（重复: ${duplicated.join(',') || '无'}）`);
  ok(
    PROGRESS_BUCKETS.map((b) => b.label).join('|') === '未完成|待家长确认|已完成',
    `三档顺序为 未完成 → 待家长确认 → 已完成（实际 ${PROGRESS_BUCKETS.map((b) => b.label).join(' → ')}）`,
  );
  ok(PROGRESS_BUCKETS[0].statuses.includes('rejected'), '驳回计入「未完成」');
  ok(PROGRESS_BUCKETS[1].statuses.join() === 'submitted', '「待家长确认」只含 submitted');

  const cfg = await (await fetch(`${BASE}/api/auth/config`)).json().catch(() => ({}));
  console.log(`\n【环境】${BASE}，APP_LOGIN=${cfg.loginEnabled === true}`);
  if (cfg.loginEnabled !== true) {
    console.log('   ⚠️  需要 APP_LOGIN=true（要区分家长/孩子身份）。请用 scripts/dev-local.sh start。');
    process.exit(2);
  }

  const parent = makeClient();
  const child = makeClient();

  // ==================== B. 用真实业务流造出 5 种状态 ====================
  console.log('\n【B】真实业务流造数据');
  const reg = await parent('POST', '/api/auth/register', {
    username: `gp${stamp}`,
    password: PWD,
    role: 'parent',
    familyName: '分组回归家庭',
  });
  if (reg.status === 429) {
    console.log('   ⚠️  注册被限流（每小时 10 次，内存计数随重启清空），请重启被测服务后重试。');
    process.exit(2);
  }
  ok(reg.status < 400, `家长注册 ${reg.status}`);
  const childId = (await parent('POST', '/api/children', { name: '分组娃' })).json?.child?.id;
  await parent('POST', '/api/auth/child-account', { childId, username: `gk${stamp}`, password: PWD });
  await child('POST', '/api/auth/login', { username: `gk${stamp}`, password: PWD });

  // 必要任务（建模板 → 昨天/今天各生成一次；昨天那条读取时会惰性变 overdue）
  await parent('POST', '/api/tasks/templates', { name: '早读', defaultPoints: 5, isDaily: true });
  await parent('POST', '/api/tasks/generate-daily', { childId, date: day(-1) });
  await parent('POST', '/api/tasks/generate-daily', { childId, date: day(0) });

  // 作业：分别造出 rejected / submitted / completed
  const hw = {};
  for (const [k, name] of [['rej', '被驳回的作业'], ['sub', '待确认的作业'], ['done', '已完成的作业']]) {
    hw[k] = (await parent('POST', '/api/tasks/homework', { childId, name, subject: '语文', points: 5, taskDate: day(0) })).json.task;
  }
  await child('POST', `/api/tasks/${hw.rej.id}/submit`, {});
  await parent('POST', `/api/tasks/${hw.rej.id}/review`, { approved: false, rejectReason: '重写' });
  await child('POST', `/api/tasks/${hw.sub.id}/submit`, {});
  await child('POST', `/api/tasks/${hw.done.id}/submit`, {});
  await parent('POST', `/api/tasks/${hw.done.id}/review`, { approved: true });
  // 习惯任务 + 目标型任务（各保持 pending，补全四种类型）
  await parent('POST', '/api/tasks/habit', { childId, name: '阅读打卡', points: 2, taskDate: day(0) });
  await parent('POST', '/api/tasks/goal', { childId, name: '攒 100 元', points: 20, targetValue: 100, taskDate: day(0) });

  // ==================== C. 拉真实数据并跑组件的分组函数 ====================
  console.log('\n【C】用真实接口数据跑 buildTaskGroups');
  const res = await child('GET', `/api/tasks?childId=${childId}&date=${day(0)}`);
  const tasks = res.json?.items ?? [];
  ok(tasks.length > 0, `取到 ${tasks.length} 个任务`);
  const byStatus = {};
  for (const t of tasks) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
  console.log(`   真实状态分布: ${JSON.stringify(byStatus)}`);
  ok(
    TASK_STATUSES.every((s) => (byStatus[s] ?? 0) > 0),
    `5 种状态都造出来了（缺少: ${TASK_STATUSES.filter((s) => !byStatus[s]).join(',') || '无'}）`,
  );

  const sorted = sortOverdueFirst(tasks);
  const progressGroups = buildTaskGroups(sorted, { mode: 'progress' });

  // 每一档：任务状态必须属于该档定义，且数量与真实状态计数吻合
  for (const g of progressGroups) {
    const bucket = PROGRESS_BUCKETS.find((b) => b.key === g.key);
    const expected = tasks.filter((t) => bucket.statuses.includes(t.status)).length;
    ok(g.tasks.length === expected, `「${g.label}」${g.tasks.length} 个（预期 ${expected}）`);
    ok(
      g.tasks.every((t) => bucket.statuses.includes(t.status)),
      `「${g.label}」内任务状态都在 ${bucket.statuses.join('/')} 内`,
    );
    ok(g.metaText === bucket.hint, `「${g.label}」标题说明为「${bucket.hint}」`);
  }

  // 关键不变量：不漏不重
  const sum = progressGroups.reduce((n, g) => n + g.tasks.length, 0);
  ok(sum === tasks.length, `各档合计 ${sum} = 任务总数 ${tasks.length}（不漏不重）`);
  ok(
    progressGroups.every((g) => g.tasks.length > 0),
    '空分组不返回（渲染层据此不显示空档）',
  );

  // ==================== D. 按类型分组 + 类型筛选联动 ====================
  console.log('\n【D】按类型分组与类型筛选');
  const typeGroups = buildTaskGroups(sorted, { mode: 'type' });
  for (const c of TASK_CATEGORIES) {
    const items = tasks.filter((t) => t.type === c.key);
    const g = typeGroups.find((x) => x.key === c.key);
    if (items.length === 0) {
      ok(g === undefined, `「${c.label}」无任务时不返回该分组`);
      continue;
    }
    const done = items.filter((t) => t.status === 'completed').length;
    ok(!!g && g.tasks.length === items.length, `「${c.label}」${g?.tasks.length} 个（预期 ${items.length}）`);
    ok(g?.metaText === `${done}/${items.length} 完成`, `「${c.label}」标题为 ${done}/${items.length} 完成`);
  }

  for (const c of TASK_CATEGORIES) {
    const only = buildTaskGroups(sorted, { mode: 'progress', category: c.key });
    const items = tasks.filter((t) => t.type === c.key);
    const total = only.reduce((n, g) => n + g.tasks.length, 0);
    ok(
      total === items.length && only.every((g) => g.tasks.every((t) => t.type === c.key)),
      `完成情况分组 + 筛选「${c.label}」：共 ${total} 个（预期 ${items.length}）且类型一致`,
    );
  }

  console.log(`\n========== 分组回归：${pass} 通过 / ${fail} 失败 ==========`);
  process.exit(fail === 0 ? 0 : 1);
})();
