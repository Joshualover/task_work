/**
 * 补提交 1 天期限 + 多家长账号 回归测试。
 * 用法：bash scripts/dev-local.sh start 之后 node scripts/test-window-and-parent.mjs
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
  const reg = await parent('POST', '/api/auth/register', {
    username: 'wdp', password: '123456', role: 'parent', displayName: '爸爸', familyName: '测试之家',
  });
  ok(reg.status < 400, `家长注册 ${reg.status}`);
  const familyId = reg.json.user.familyId;
  const inviteCode = (await parent('GET', '/api/auth/me')).json.family.inviteCode;
  ok(!!inviteCode, `家庭邀请码 ${inviteCode}`);

  const childRes = await parent('POST', '/api/children', { name: '期限娃' });
  const childId = childRes.json.child.id;
  const child = makeClient('child');
  await child('GET', '/', undefined, { accept: 'text/html' });
  await parent('POST', '/api/auth/child-account', { childId, username: 'wdk', password: '123456' });
  await child('POST', '/api/auth/login', { username: 'wdk', password: '123456' });

  console.log('\n【一】补提交期限 = 逾期后 1 天');

  // 1) 截止日=昨天 → 逾期当天（今天）为最后机会：可见 + 可提交
  const inWindow = await parent('POST', '/api/tasks/homework', {
    childId, name: '昨天截止的作业', points: 10, taskDate: daysAgo(1), deadline: daysAgo(1),
  });
  const inWindowId = inWindow.json.task.id;
  const listA = await parent('GET', `/api/tasks?childId=${childId}&date=${today()}`);
  ok(!!listA.json.items.find((t) => t.id === inWindowId), '逾期 1 天内：仍显示在任务池');
  const subA = await child('POST', `/api/tasks/${inWindowId}/submit`, { completionNote: '今天补上' });
  ok(subA.status < 400 && subA.json.task.isLateSubmit === true, '逾期 1 天内：可申请补提交');
  await parent('POST', `/api/tasks/${inWindowId}/review`, { approved: true });

  // 2) 截止日=2 天前（顺延 0）→ 补提交期限=昨天 → 已过期
  const expired = await parent('POST', '/api/tasks/homework', {
    childId, name: '前天截止的作业', points: 10, taskDate: daysAgo(2), deadline: daysAgo(2),
  });
  const expiredId = expired.json.task.id;
  const listB = await parent('GET', `/api/tasks?childId=${childId}&date=${today()}`);
  ok(!listB.json.items.find((t) => t.id === expiredId), '逾期超 1 天：不再显示在任务池');
  const subB = await child('POST', `/api/tasks/${expiredId}/submit`, { completionNote: '太晚了' }, { expectError: true });
  ok(subB.status === 400, `逾期超 1 天：提交被拒（${subB.status}）`);
  ok(
    typeof subB.json?.error?.message === 'string' && subB.json.error.message.includes('补提交期限已过'),
    `错误提示：${subB.json?.error?.message}`,
  );

  // 3) 顺延可延长补提交期限：截止 3 天前 + 顺延 2 天 → 期限 = 今天
  const extended = await parent('POST', '/api/tasks/homework', {
    childId, name: '顺延作业', points: 10, taskDate: daysAgo(4), deadline: daysAgo(3),
  });
  const extendedId = extended.json.task.id;
  // 通过 PATCH 加顺延天数
  const patched = await parent('PATCH', `/api/tasks/${extendedId}`, { extendDays: 2 });
  if (patched.status >= 400) console.log('   （PATCH 顺延失败，跳过该断言）', JSON.stringify(patched.json).slice(0, 120));
  const listC = await parent('GET', `/api/tasks?childId=${childId}&date=${today()}`);
  const extRow = listC.json.items.find((t) => t.id === extendedId);
  ok(!!extRow && extRow.status === 'overdue', '截止 3 天前 + 顺延 2 天：仍在补提交期限内（可见）');
  const subC = await child('POST', `/api/tasks/${extendedId}/submit`, { completionNote: '顺延内补上' });
  ok(subC.status < 400, '顺延内：可申请补提交');

  console.log('\n【二】必要任务的 1 天期限');
  await parent('POST', '/api/tasks/templates', {
    name: '每日阅读', defaultPoints: 5, isDaily: true, frequency: 'daily',
  });
  const gen = await parent('POST', '/api/tasks/generate-daily', { childId, date: daysAgo(2) });
  const dailyId = gen.json.items?.[0]?.id;
  if (!dailyId) console.log('   （未生成必要任务实例，跳过）', JSON.stringify(gen.json).slice(0, 160));
  else {
    const listD = await parent('GET', `/api/tasks?childId=${childId}&date=${today()}`);
    ok(!listD.json.items.find((t) => t.id === dailyId), '必要任务逾期超 1 天：不再显示');
    const subD = await child('POST', `/api/tasks/${dailyId}/submit`, {}, { expectError: true });
    ok(subD.status === 400, `必要任务逾期超 1 天：提交被拒（${subD.status}）`);
  }

  console.log('\n【三】同一家庭多个家长账号');
  const listP0 = await parent('GET', '/api/auth/parent-accounts');
  ok(listP0.json.items.length === 1, `初始家长账号数 = 1（实际 ${listP0.json.items.length}）`);

  const createMom = await parent('POST', '/api/auth/parent-account', {
    username: '妈妈', password: '123456', displayName: '妈妈',
  });
  ok(createMom.status < 400, `创建妈妈账号 ${createMom.status}`);

  const mom = makeClient('mom');
  await mom('GET', '/', undefined, { accept: 'text/html' });
  const momLogin = await mom('POST', '/api/auth/login', { username: '妈妈', password: '123456' });
  ok(momLogin.status < 400, `妈妈登录 ${momLogin.status}`);
  const momMe = await mom('GET', '/api/auth/me');
  ok(momMe.json.user.role === 'parent', '妈妈角色为家长');
  ok(momMe.json.user.familyId === familyId, '妈妈与爸爸属于同一家庭');
  ok(momMe.json.family.inviteCode === inviteCode, `妈妈能看到同一邀请码 ${momMe.json.family.inviteCode}`);

  // 妈妈拥有完整管理权限
  const momChildren = await mom('GET', '/api/children');
  ok(momChildren.json.items.some((c) => c.id === childId), '妈妈可以看到孩子');
  const momTask = await mom('POST', '/api/tasks/homework', {
    childId, name: '妈妈布置的作业', points: 8, taskDate: today(),
  });
  ok(momTask.status < 400, '妈妈可以给孩子布置作业');
  const momReviewTaskId = momTask.json.task.id;
  await child('POST', `/api/tasks/${momReviewTaskId}/submit`, {});
  const momReview = await mom('POST', `/api/tasks/${momReviewTaskId}/review`, { approved: true });
  ok(momReview.status < 400, '妈妈可以审批任务并发积分');
  const momRewards = await mom('GET', '/api/rewards');
  ok(momRewards.status < 400, '妈妈可以访问奖励管理');
  const momReport = await mom('GET', `/api/report/stats?childId=${childId}`);
  ok(momReport.status < 400, '妈妈可以查看报表');

  const listP1 = await mom('GET', '/api/auth/parent-accounts');
  ok(listP1.json.items.length === 2, `家长账号数 = 2（实际 ${listP1.json.items.length}）`);

  // 重置妈妈密码
  const momId = listP1.json.items.find((p) => p.username === '妈妈')?.id;
  const reset = await parent('POST', '/api/auth/parent-account', {
    userId: momId, username: '妈妈', password: 'abcdef', displayName: '妈妈',
  });
  ok(reset.status < 400, `重置妈妈密码 ${reset.status}`);
  const mom2 = makeClient('mom2');
  await mom2('GET', '/', undefined, { accept: 'text/html' });
  const momLogin2 = await mom2('POST', '/api/auth/login', { username: '妈妈', password: 'abcdef' });
  ok(momLogin2.status < 400, `妈妈用新密码登录 ${momLogin2.status}`);

  // 妈妈自己用邀请码注册加入
  const auntie = makeClient('auntie');
  await auntie('GET', '/', undefined, { accept: 'text/html' });
  const join = await auntie('POST', '/api/auth/register', {
    username: '奶奶', password: '123456', role: 'parent', displayName: '奶奶', inviteCode,
  });
  ok(join.status < 400, `家长用邀请码注册 ${join.status}`);
  const auntieMe = await auntie('GET', '/api/auth/me');
  ok(auntieMe.json.user.familyId === familyId, '邀请码注册后加入同一家庭');
  const listP2 = await parent('GET', '/api/auth/parent-accounts');
  ok(listP2.json.items.length === 3, `家长账号数 = 3（实际 ${listP2.json.items.length}）`);

  // 孩子无权访问家长账号接口
  const childDeny = await child('GET', '/api/auth/parent-accounts', undefined, { expectError: true });
  ok(childDeny.status === 403, `孩子访问家长账号接口被拒（${childDeny.status}）`);
  // 重名账号
  const dup = await parent('POST', '/api/auth/parent-account', {
    username: '妈妈', password: '123456',
  }, { expectError: true });
  ok(dup.status === 409, `重名家长账号被拒（${dup.status}）`);
  // 密码太短
  const short = await parent('POST', '/api/auth/parent-account', {
    username: '叔叔', password: '123',
  }, { expectError: true });
  ok(short.status === 400, `密码过短被拒（${short.status}）`);

  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  console.log('familyId=' + familyId);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('测试异常', e); process.exit(1); });
