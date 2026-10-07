/**
 * 「零花钱目标」回归：目标进度自动跟随零花钱余额，达标自动提交待确认。
 * 用法：bash scripts/dev-local.sh start 之后 node scripts/test-allowance-goal.mjs
 */
const BASE = 'http://localhost:8080';
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass += 1; console.log(`   ✅ ${msg}`); }
  else { fail += 1; console.log(`   ❌ ${msg}`); }
};

function makeClient() {
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
      console.log(`   ⚠️  ${method} ${path} -> ${res.status}`, JSON.stringify(json).slice(0, 200));
    }
    return { status: res.status, json };
  };
}

(async () => {
  const parent = makeClient();
  await parent('GET', '/', undefined, { accept: 'text/html' });
  await parent('POST', '/api/auth/register', { username: 'agp', password: '123456', role: 'parent' });
  const childId = (await parent('POST', '/api/children', { name: '存钱娃' })).json.child.id;
  await parent('POST', '/api/auth/child-account', { childId, username: 'agk', password: '123456' });
  const child = makeClient();
  await child('GET', '/', undefined, { accept: 'text/html' });
  await child('POST', '/api/auth/login', { username: 'agk', password: '123456' });

  /** 读取孩子端看到的该任务 */
  const fetchTask = async (id) => {
    const list = await child('GET', `/api/tasks?childId=${childId}&date=${today()}`);
    return list.json.items.find((t) => t.id === id);
  };
  const addMoney = async (yuan) => {
    const res = await parent('POST', '/api/allowance/adjust', {
      childId, changeAmount: Math.round(yuan * 100), reason: '存入零花钱',
    });
    return res.status < 400;
  };

  console.log('\n【创建零花钱目标：存够 100 元】');
  const goal = (await parent('POST', '/api/tasks/goal', {
    childId, name: '存够100元买玩具', points: 20, targetValue: 100,
    unit: '个', linkedAllowanceGoal: true, taskDate: today(),
  })).json.task;
  ok(goal.linkedAllowanceGoal === true, '任务标记为跟随零花钱余额');
  ok(goal.unit === '元', `单位自动改为「元」（实际 ${goal.unit}）`);
  ok((await fetchTask(goal.id))?.currentValue === 0, '初始进度 0（余额 0）');

  console.log('\n【余额变化 → 进度自动同步】');
  await addMoney(30);
  ok((await fetchTask(goal.id))?.currentValue === 30, `余额 30 元 → 进度 30（实际 ${(await fetchTask(goal.id))?.currentValue}）`);
  await addMoney(50);
  ok((await fetchTask(goal.id))?.currentValue === 80, '余额 80 元 → 进度 80');
  ok((await fetchTask(goal.id))?.status === 'pending', '未达标仍是待完成');

  console.log('\n【余额达标 → 自动提交待确认】');
  await addMoney(25); // 累计 105 元
  const reached = await fetchTask(goal.id);
  ok(reached?.currentValue === 105, `进度 105（实际 ${reached?.currentValue}）`);
  ok(reached?.status === 'submitted', `余额达标后自动提交待确认（实际 ${reached?.status}）`);
  const notif = (await parent('GET', '/api/notifications')).json.items.find((n) => n.relatedId === goal.id);
  ok(!!notif, `家长收到达成提醒：${notif?.body ?? ''}`);

  const approve = await parent('POST', `/api/tasks/${goal.id}/review`, { approved: true });
  ok(approve.status < 400, `家长审批通过 ${approve.status}`);
  const points = (await parent('GET', `/api/points/balance?childId=${childId}`)).json.balance;
  ok(points === 20, `目标达成奖励 20 积分到账（实际 ${points}）`);

  console.log('\n【跟随余额的目标不允许手动记进度】');
  const goal2 = (await parent('POST', '/api/tasks/goal', {
    childId, name: '存够200元买自行车', points: 30, targetValue: 200,
    linkedAllowanceGoal: true, taskDate: today(),
  })).json.task;
  const manual = await child('POST', `/api/tasks/${goal2.id}/goal-progress`, { delta: 10 }, { expectError: true });
  ok(manual.status === 400, `手动记进度被拒（${manual.status}）`);
  ok(String(manual.json?.error?.message).includes('跟随零花钱余额'), `提示文案：${manual.json?.error?.message}`);

  console.log('\n【花钱后进度跟着减少】');
  ok((await fetchTask(goal2.id))?.currentValue === 105, '新目标进度=当前余额 105');
  const reqRes = await child('POST', '/api/allowance/requests', {
    childId, amount: 2000, purpose: '买文具',
  });
  const requestId = reqRes.json.request?.id ?? reqRes.json.id;
  await parent('POST', `/api/allowance/requests/${requestId}/review`, { approved: true });
  const after = await fetchTask(goal2.id);
  ok(after?.currentValue === 85, `花掉 20 元后进度降为 85（实际 ${after?.currentValue}）`);
  ok(after?.status === 'pending', '仍未达标，保持待完成');

  console.log('\n【普通目标不受影响】');
  const normal = (await parent('POST', '/api/tasks/goal', {
    childId, name: '跳绳100个', points: 10, targetValue: 100, unit: '个', taskDate: today(),
  })).json.task;
  ok(normal.linkedAllowanceGoal === false, '普通目标不跟随余额');
  ok(normal.unit === '个', '普通目标单位保持「个」');
  const add = await child('POST', `/api/tasks/${normal.id}/goal-progress`, { delta: 100 });
  ok(add.status < 400, `普通目标仍可手动记进度 ${add.status}`);
  ok(add.json.task?.currentValue === 100, `普通目标进度为 100（实际 ${add.json.task?.currentValue}）`);
  ok(add.json.task?.status === 'submitted', '普通目标达标后自动提交');

  console.log('\n【编辑切换开关】');
  const off = (await parent('PATCH', `/api/tasks/${goal2.id}`, { linkedAllowanceGoal: false })).json.task;
  ok(off.linkedAllowanceGoal === false, '可以把已有目标改回手动模式');
  const manualNow = await child('POST', `/api/tasks/${goal2.id}/goal-progress`, { delta: 1 });
  ok(manualNow.status < 400, '改回手动后可手动记进度');

  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  console.log('childId=' + childId);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('测试异常', e); process.exit(1); });
