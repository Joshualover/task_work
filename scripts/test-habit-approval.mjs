/**
 * 「习惯任务需家长确认」回归：打卡进待确认 → 家长通过才发奖 / 驳回退回次数。
 * 用法：bash scripts/dev-local.sh start 之后 node scripts/test-habit-approval.mjs
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
  await parent('POST', '/api/auth/register', { username: 'hcp', password: '123456', role: 'parent' });
  const childId = (await parent('POST', '/api/children', { name: '待确认娃' })).json.child.id;
  await parent('POST', '/api/auth/child-account', { childId, username: 'hck', password: '123456' });
  const child = makeClient();
  await child('GET', '/', undefined, { accept: 'text/html' });
  await child('POST', '/api/auth/login', { username: 'hck', password: '123456' });

  const points = async () => (await parent('GET', `/api/points/balance?childId=${childId}`)).json.balance;
  const money = async () => (await parent('GET', `/api/allowance/balance?childId=${childId}`)).json.balance;
  const taskOf = async (id) => {
    const list = await child('GET', `/api/tasks?childId=${childId}&date=${today()}`);
    return list.json.items.find((t) => t.id === id);
  };

  console.log('\n【创建「需家长确认」的习惯：每次 6 积分 + 2 元，每日 2 次】');
  const habit = (await parent('POST', '/api/tasks/habit', {
    childId, name: '自己做一顿饭', points: 6, allowanceAmount: 200,
    dailyLimit: 2, needApproval: true, taskDate: today(),
  })).json.task;
  ok(habit.habitNeedApproval === true, '开关已开启');
  ok(habit.habitPendingCount === 0, '初始待确认 0');

  console.log('\n【打卡只登记，不发奖】');
  const c1 = await child('POST', `/api/tasks/${habit.id}/habit-check`, {});
  ok(c1.status < 400, `打卡成功 ${c1.status}`);
  ok(c1.json.pendingApproval === true, '返回 pendingApproval=true');
  ok(c1.json.count === 1, `今日次数 1（实际 ${c1.json.count}）`);
  ok(c1.json.awardedPoints === 0 && c1.json.awardedAllowance === 0, '本次未发放奖励');
  ok((await points()) === 0, `积分仍为 0（实际 ${await points()}）`);
  ok((await money()) === 0, `零花钱仍为 0（实际 ${await money()}）`);

  const pending = (await parent('GET', `/api/tasks/habit-checkins?childId=${childId}`)).json.items;
  ok(pending.length === 1, `家长端待确认 1 条（实际 ${pending.length}）`);
  ok(pending[0]?.taskName === '自己做一顿饭' && pending[0]?.seq === 1, `记录含任务名与第几次（${pending[0]?.taskName} 第 ${pending[0]?.seq} 次）`);
  ok(pending[0]?.points === 6 && pending[0]?.allowanceAmount === 200, '记录了奖励快照 6 积分 + 2 元');
  const listTask = await taskOf(habit.id);
  ok(listTask?.habitPendingCount === 1, `卡片上显示待审 1（实际 ${listTask?.habitPendingCount}）`);
  const notif = (await parent('GET', '/api/notifications')).json.items.find((n) => n.relatedId === habit.id);
  ok(!!notif, `家长收到提醒：${notif?.title}`);

  console.log('\n【家长通过 → 发放奖励】');
  const approve = await parent('POST', `/api/tasks/habit-checkins/${pending[0].id}/review`, { approved: true });
  ok(approve.status < 400, `审核通过 ${approve.status}`);
  ok((await points()) === 6, `积分 +6（实际 ${await points()}）`);
  ok((await money()) === 200, `零花钱 +2 元（实际 ${await money()}）`);
  const afterApprove = (await parent('GET', `/api/tasks/habit-checkins?childId=${childId}`)).json.items;
  ok(afterApprove.length === 0, '待确认列表已清空');
  const txs = (await parent('GET', `/api/points/transactions?childId=${childId}&page=1&pageSize=10`)).json.items;
  ok(txs.some((t) => t.relatedId === habit.id && String(t.reason).includes('习惯打卡')), '积分流水记录了习惯打卡');

  console.log('\n【重复审核被拒】');
  const again = await parent('POST', `/api/tasks/habit-checkins/${pending[0].id}/review`, { approved: true }, { expectError: true });
  ok(again.status === 409, `重复审核返回 409（${again.status}）`);

  console.log('\n【驳回 → 次数退回、不发奖】');
  const c2 = await child('POST', `/api/tasks/${habit.id}/habit-check`, {});
  ok(c2.json.count === 2, `第二次打卡（次数 ${c2.json.count}）`);
  const pending2 = (await parent('GET', `/api/tasks/habit-checkins?childId=${childId}`)).json.items;
  const reject = await parent('POST', `/api/tasks/habit-checkins/${pending2[0].id}/review`, {
    approved: false, rejectReason: '今天不算',
  });
  ok(reject.status < 400, `驳回成功 ${reject.status}`);
  ok((await points()) === 6, `驳回后积分不变（实际 ${await points()}）`);
  const t3 = await taskOf(habit.id);
  ok(t3?.habitCount === 1, `驳回后次数退回为 1（实际 ${t3?.habitCount}）`);
  ok(t3?.habitPendingCount === 0, '待确认清零');

  console.log('\n【上限依然生效（按 pending+approved 占用）】');
  await child('POST', `/api/tasks/${habit.id}/habit-check`, {});
  const c4 = await child('POST', `/api/tasks/${habit.id}/habit-check`, {}, { expectError: true });
  ok(c4.status >= 400, `达到每日上限后不能再打卡（${c4.status}）`);

  console.log('\n【「全部通过」逐条审核】');
  const allPending = (await parent('GET', `/api/tasks/habit-checkins?childId=${childId}`)).json.items;
  ok(allPending.length === 1, `当前待确认 ${allPending.length} 条`);
  for (const item of allPending) {
    await parent('POST', `/api/tasks/habit-checkins/${item.id}/review`, { approved: true });
  }
  const rest = (await parent('GET', `/api/tasks/habit-checkins?childId=${childId}`)).json.items;
  ok(rest.length === 0, '全部处理完毕');
  ok((await points()) === 12, `积分累计 12（2 次通过 × 6，实际 ${await points()}）`);

  console.log('\n【关闭开关后恢复即时发奖】');
  const off = (await parent('PATCH', `/api/tasks/${habit.id}`, { habitNeedApproval: false })).json.task;
  ok(off.habitNeedApproval === false, '开关已关闭');
  // 先模拟跨天以便继续打卡
  const pgModule = await import(new URL('../.local-dev/pg/node_modules/pg/lib/index.js', import.meta.url).href);
  const Client = pgModule.default?.Client ?? pgModule.Client;
  const db = new Client({ connectionString: 'postgres://u:p@127.0.0.1:5432/db' });
  await db.connect();
  await db.query('update task_instance set habit_last_date = current_date - 1 where id = $1', [habit.id]);
  await db.end();
  const c5 = await child('POST', `/api/tasks/${habit.id}/habit-check`, {});
  ok(c5.json.pendingApproval === false && c5.json.awardedPoints === 6, '关闭后打卡立即发奖');

  console.log('\n【越权：他人不能查/审本家庭的打卡】');
  const other = makeClient();
  await other('GET', '/', undefined, { accept: 'text/html' });
  await other('POST', '/api/auth/register', { username: 'hcq', password: '123456', role: 'parent' });
  const cross = await other('GET', `/api/tasks/habit-checkins?childId=${childId}`, undefined, { expectError: true });
  ok(cross.status >= 400, `他人查询被拒（${cross.status}）`);

  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  console.log('childId=' + childId);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('测试异常', e); process.exit(1); });
