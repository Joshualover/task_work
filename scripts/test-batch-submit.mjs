/**
 * 多选批量提交 + 家长「全部通过」回归测试。
 * 用法：bash scripts/dev-local.sh start 之后 node scripts/test-batch-submit.mjs
 */
const BASE = 'http://localhost:8080';
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() + 8 * 3600e3 - n * 86400e3).toISOString().slice(0, 10);

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
  await parent('POST', '/api/auth/register', { username: 'btp', password: '123456', role: 'parent' });
  const childRes = await parent('POST', '/api/children', { name: '批量娃' });
  const childId = childRes.json.child.id;
  await parent('POST', '/api/auth/child-account', { childId, username: 'btk', password: '123456' });
  const child = makeClient('child');
  await child('GET', '/', undefined, { accept: 'text/html' });
  await child('POST', '/api/auth/login', { username: 'btk', password: '123456' });

  const mk = async (name, points, deadline) => {
    const r = await parent('POST', '/api/tasks/homework', {
      childId, name, points, taskDate: today(), ...(deadline ? { deadline } : {}),
    });
    return r.json.task.id;
  };

  console.log('\n【一】孩子多选一起提交');
  const t1 = await mk('语文作业', 10);
  const t2 = await mk('数学作业', 20);
  const t3 = await mk('英语作业', 5);
  ok(!!t1 && !!t2 && !!t3, '创建 3 个作业任务');

  const before = await parent('GET', '/api/notifications');
  const beforeCount = before.json.items.length;

  const batch = await child('POST', '/api/tasks/batch-submit', {
    taskIds: [t1, t2, t3], completionNote: '都写完啦',
  });
  ok(batch.status < 400, `批量提交 ${batch.status}`);
  ok(batch.json.submitted?.length === 3, `3 个全部提交成功（实际 ${batch.json.submitted?.length}）`);
  ok(batch.json.failed?.length === 0, '无失败项');

  const list = await parent('GET', `/api/tasks?childId=${childId}&date=${today()}`);
  const submittedCount = list.json.items.filter((t) => t.status === 'submitted').length;
  ok(submittedCount === 3, `任务池显示 3 个待确认（实际 ${submittedCount}）`);

  const after = await parent('GET', '/api/notifications');
  const newNotifs = after.json.items.length - beforeCount;
  ok(newNotifs === 1, `家长只收到 1 条合并提醒（实际 ${newNotifs}）`);
  const n = after.json.items[0];
  ok(!!n && n.title.includes('3 个任务'), `提醒标题：${n?.title}`);
  ok(!!n && n.body.includes('语文作业') && n.body.includes('英语作业'), `提醒正文列出任务名：${n?.body}`);

  console.log('\n【二】家长「全部通过」');
  const approve = await parent('POST', '/api/tasks/batch-review', { taskIds: [t1, t2, t3] });
  ok(approve.status < 400, `批量通过 ${approve.status}`);
  ok(approve.json.approved?.length === 3, `3 个全部通过（实际 ${approve.json.approved?.length}）`);
  const balance = await parent('GET', `/api/points/balance?childId=${childId}`);
  ok(balance.json.balance === 35, `积分合计 10+20+5=35（实际 ${balance.json.balance}）`);
  const list2 = await parent('GET', `/api/tasks?childId=${childId}&date=${today()}`);
  ok(list2.json.items.every((t) => t.status === 'completed'), '全部变为已完成');

  console.log('\n【三】部分失败与边界');
  const t4 = await mk('科学作业', 8);
  // 先单条提交，再放进批量里 → 该条应失败，其余成功
  const t5 = await mk('历史作业', 8);
  await child('POST', `/api/tasks/${t5}/submit`, {});
  const mixed = await child('POST', '/api/tasks/batch-submit', { taskIds: [t4, t5] });
  ok(mixed.json.submitted?.length === 1, `重复提交的跳过：成功 ${mixed.json.submitted?.length} 个`);
  ok(mixed.json.failed?.length === 1 && mixed.json.failed[0].taskId === t5, '失败明细包含已提交的任务');

  // 超期任务不能批量提交
  const expired = await mk('过期作业', 9, daysAgo(2));
  await parent('GET', `/api/tasks?childId=${childId}&date=${today()}`);
  const exp = await child('POST', '/api/tasks/batch-submit', { taskIds: [expired] }, { expectError: true });
  ok(exp.json.failed?.length === 1, '超期任务进入失败明细');
  ok(
    String(exp.json.failed?.[0]?.reason).includes('补提交期限已过'),
    `失败原因：${exp.json.failed?.[0]?.reason}`,
  );

  // 空数组
  const empty = await parent('POST', '/api/tasks/batch-review', { taskIds: [] }, { expectError: true });
  ok(empty.status === 400, `空 taskIds 被拒（${empty.status}）`);
  // 不属于本家庭的任务
  const foreign = await parent('POST', '/api/tasks/batch-review', {
    taskIds: ['aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'],
  }, { expectError: true });
  ok(foreign.status === 404, `其他/不存在的任务被拒（${foreign.status}）`);
  // 孩子无权批量审核
  const childApprove = await child('POST', '/api/tasks/batch-review', {
    taskIds: [t4],
  }, { expectError: true });
  ok(childApprove.status === 403, `孩子调用批量审核被拒（${childApprove.status}）`);

  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  console.log('childId=' + childId);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('测试异常', e); process.exit(1); });
