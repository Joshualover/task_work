/**
 * 报表数据校验：确认图表拿到的 weeklyTrend 数字与真实完成情况一致。
 * 用法：bash scripts/dev-local.sh start 之后 node scripts/test-report-stats.mjs
 */
const BASE = 'http://localhost:8080';
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass += 1; console.log(`   ✅ ${msg}`); }
  else { fail += 1; console.log(`   ❌ ${msg}`); }
};

function makeClient(label) {
  let cookie = '';
  return async function req(method, path, body, opts = {}) {
    const headers = { Accept: opts.accept || 'application/json' };
    if (cookie) headers['Cookie'] = cookie;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(BASE + path, {
      method, headers, redirect: 'manual',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    for (const c of (res.headers.getSetCookie?.() ?? [])) {
      const kv = c.split(';')[0];
      const k = kv.split('=')[0];
      if (cookie) cookie = cookie.split('; ').filter((x) => !x.startsWith(k + '=')).join('; ');
      cookie = cookie ? cookie + '; ' + kv : kv;
    }
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    if (res.status >= 400 && !opts.expectError) {
      console.log(`   ⚠️  ${label} ${method} ${path} -> ${res.status}`, JSON.stringify(json).slice(0, 160));
    }
    return { status: res.status, json };
  };
}

(async () => {
  const parent = makeClient('parent');
  await parent('GET', '/', undefined, { accept: 'text/html' });
  await parent('POST', '/api/auth/register', { username: 'rsp', password: '123456', role: 'parent' });
  const childId = (await parent('POST', '/api/children', { name: '报表娃' })).json.child.id;
  await parent('POST', '/api/auth/child-account', { childId, username: 'rsk', password: '123456' });
  const child = makeClient('child');
  await child('GET', '/', undefined, { accept: 'text/html' });
  await child('POST', '/api/auth/login', { username: 'rsk', password: '123456' });

  console.log('\n【无数据时】');
  const empty = await parent('GET', `/api/report/stats?childId=${childId}`);
  ok(empty.status < 400, `接口可用 ${empty.status}`);
  ok(empty.json.weeklyTrend?.length === 4, `返回近 4 周（实际 ${empty.json.weeklyTrend?.length}）`);
  ok(
    empty.json.weeklyTrend.every((t) => t.points === 0 && t.completionRate === 0),
    '无任务时全为 0（前端会显示引导文案而不是白图）',
  );
  const weeksAscending = empty.json.weeklyTrend.every(
    (t, i, arr) => i === 0 || arr[i - 1].week < t.week,
  );
  ok(weeksAscending, '周数据按时间升序（图表从左到右）');

  console.log('\n【有数据时】');
  const mk = async (name, points) =>
    (await parent('POST', '/api/tasks/homework', { childId, name, points, taskDate: today() }))
      .json.task.id;
  const t1 = await mk('语文作业', 10);
  const t2 = await mk('数学作业', 5);
  await child('POST', '/api/tasks/batch-submit', { taskIds: [t1, t2] });
  await parent('POST', '/api/tasks/batch-review', { taskIds: [t1, t2] });

  const stats = (await parent('GET', `/api/report/stats?childId=${childId}`)).json;
  ok(stats.totalPointsEarned === 15, `累计积分 15（实际 ${stats.totalPointsEarned}）`);
  const thisWeek = stats.weeklyTrend[stats.weeklyTrend.length - 1];
  ok(thisWeek.points === 15, `本周积分 15（实际 ${thisWeek.points}）`);
  ok(thisWeek.completionRate === 1, `本周完成率 100%（实际 ${Math.round(thisWeek.completionRate * 100)}%）`);
  ok(stats.weeklyTrend[0].points === 0, '上周及更早仍为 0');
  ok(
    Math.max(...stats.weeklyTrend.map((t) => t.points)) === 15,
    '柱状图最大值取自真实数据（用于纵轴缩放）',
  );

  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  console.log('childId=' + childId);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('测试异常', e); process.exit(1); });
