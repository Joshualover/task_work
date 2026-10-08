/**
 * 「习惯任务」回归：按次打卡、每次立刻发奖、每日上限、跨天归零。
 * 用法：bash scripts/dev-local.sh start 之后 node scripts/test-habit-task.mjs
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
  await parent('POST', '/api/auth/register', { username: 'hbp', password: '123456', role: 'parent' });
  const childId = (await parent('POST', '/api/children', { name: '习惯娃' })).json.child.id;
  await parent('POST', '/api/auth/child-account', { childId, username: 'hbk', password: '123456' });
  const child = makeClient();
  await child('GET', '/', undefined, { accept: 'text/html' });
  await child('POST', '/api/auth/login', { username: 'hbk', password: '123456' });

  const points = async () => (await parent('GET', `/api/points/balance?childId=${childId}`)).json.balance;
  const money = async () => (await parent('GET', `/api/allowance/balance?childId=${childId}`)).json.balance;
  const fetchTask = async (id) => {
    const list = await child('GET', `/api/tasks?childId=${childId}&date=${today()}`);
    return list.json.items.find((t) => t.id === id);
  };

  console.log('\n【创建习惯任务：每天最多 3 次，每次 5 积分 + 1 元】');
  const created = await parent('POST', '/api/tasks/habit', {
    childId, name: '喝水', points: 5, allowanceAmount: 100, dailyLimit: 3, taskDate: today(),
  });
  const habit = created.json.task;
  ok(created.status < 400 && !!habit?.id, `创建成功 ${created.status}`);
  ok(habit.type === 'habit', `类型为 habit（实际 ${habit.type}）`);
  ok(habit.habitDailyLimit === 3, `每日上限 3（实际 ${habit.habitDailyLimit}）`);
  ok(habit.habitCount === 0, '初始今日次数 0');
  ok(habit.habitPointsPerTime === 5 && habit.habitAllowancePerTime === 100, '每次奖励 5 积分 + 1 元');

  console.log('\n【打卡一次 → 立刻发奖】');
  const c1 = await child('POST', `/api/tasks/${habit.id}/habit-check`, {});
  ok(c1.status < 400, `打卡成功 ${c1.status}`);
  ok(c1.json.count === 1, `今日次数 1（实际 ${c1.json.count}）`);
  ok(c1.json.awardedPoints === 5 && c1.json.awardedAllowance === 100, '本次发放 5 积分 + 100 分零花钱');
  ok(c1.json.reachedDailyLimit === false, '未达上限');
  ok((await points()) === 5, `积分余额 5（实际 ${await points()}）`);
  ok((await money()) === 100, `零花钱 100 分（实际 ${await money()}）`);

  console.log('\n【连续打卡累加】');
  const c2 = await child('POST', `/api/tasks/${habit.id}/habit-check`, {});
  ok(c2.json.count === 2, `次数 2（实际 ${c2.json.count}）`);
  const c3 = await child('POST', `/api/tasks/${habit.id}/habit-check`, {});
  ok(c3.json.count === 3 && c3.json.reachedDailyLimit === true, '第 3 次达到每日上限');
  ok((await points()) === 15, `积分累计 15（实际 ${await points()}）`);
  ok((await money()) === 300, `零花钱累计 300 分（实际 ${await money()}）`);

  console.log('\n【超过上限被拒】');
  const c4 = await child('POST', `/api/tasks/${habit.id}/habit-check`, {}, { expectError: true });
  ok(c4.status >= 400, `第 4 次被拒（${c4.status}）`);
  ok(String(c4.json?.error?.message).includes('上限'), `提示：${c4.json?.error?.message}`);
  ok((await points()) === 15, '被拒后积分没变化');

  console.log('\n【流水可追溯（每笔一次）】');
  const txs = (await parent('GET', `/api/points/transactions?childId=${childId}&page=1&pageSize=20`)).json.items;
  const habitTxs = txs.filter((t) => t.relatedId === habit.id);
  ok(habitTxs.length === 3, `积分流水 3 笔（实际 ${habitTxs.length}）`);
  ok(habitTxs.some((t) => String(t.reason).includes('第 3 次')), '流水备注含次数');
  const atxs = (await parent('GET', `/api/allowance/transactions?childId=${childId}&page=1&pageSize=20`)).json.items;
  ok(atxs.filter((t) => t.relatedId === habit.id).length === 3, '零花钱流水 3 笔');

  console.log('\n【无上限的习惯任务】');
  const unlimited = (await parent('POST', '/api/tasks/habit', {
    childId, name: '阅读', points: 2, dailyLimit: 0, taskDate: today(),
  })).json.task;
  ok(unlimited.habitDailyLimit === 0, '上限 0 = 不限');
  let last = null;
  for (let i = 0; i < 5; i += 1) {
    last = await child('POST', `/api/tasks/${unlimited.id}/habit-check`, {});
  }
  ok(last?.json?.count === 5, `不限次数可连续打卡 5 次（实际 ${last?.json?.count}）`);

  console.log('\n【字段校验】');
  const noReward = await parent('POST', '/api/tasks/habit', {
    childId, name: '无奖励', points: 0, taskDate: today(),
  }, { expectError: true });
  ok(noReward.status === 400, `积分与零花钱都为 0 被拒（${noReward.status}）`);
  const notHabit = await child('POST', '/api/tasks/11111111-2222-4333-8444-555555555555/habit-check', {}, { expectError: true });
  ok(notHabit.status >= 400, `对不存在的任务打卡被拒（${notHabit.status}）`);

  console.log('\n【跨天自动归零（把 habit_last_date 改成昨天模拟真实跨天）】');
  const pgModule = await import(
    new URL('../.local-dev/pg/node_modules/pg/lib/index.js', import.meta.url).href
  );
  const Client = pgModule.default?.Client ?? pgModule.Client;
  const db = new Client({ connectionString: 'postgres://u:p@127.0.0.1:5432/db' });
  await db.connect();
  await db.query(
    "update task_instance set habit_last_date = current_date - 1 where id = $1",
    [habit.id],
  );
  await db.end();

  const resett = await fetchTask(habit.id);
  ok(!!resett, '习惯任务仍常驻显示（不会消失）');
  ok(resett?.habitCount === 0, `跨天后次数归零（实际 ${resett?.habitCount}）`);
  ok(resett?.status === 'pending', '跨天后状态仍为待完成');
  const c5 = await child('POST', `/api/tasks/${habit.id}/habit-check`, {});
  ok(c5.json.count === 1, '新的一天可以重新打卡（从 1 开始）');

  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  console.log('childId=' + childId);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('测试异常', e); process.exit(1); });
