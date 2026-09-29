/**
 * 「任务奖励零花钱」回归：任务/模板可配置零花钱，审批通过后入账（分）。
 * 用法：bash scripts/dev-local.sh start 之后 node scripts/test-task-allowance.mjs
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
  await parent('POST', '/api/auth/register', { username: 'alp', password: '123456', role: 'parent' });
  const childId = (await parent('POST', '/api/children', { name: '零花娃' })).json.child.id;
  await parent('POST', '/api/auth/child-account', { childId, username: 'alk', password: '123456' });
  const child = makeClient();
  await child('GET', '/', undefined, { accept: 'text/html' });
  await child('POST', '/api/auth/login', { username: 'alk', password: '123456' });

  const balance = async () => (await parent('GET', `/api/allowance/balance?childId=${childId}`)).json.balance;

  console.log('\n【作业任务配置零花钱：2 元】');
  const hw = (await parent('POST', '/api/tasks/homework', {
    childId, name: '背古诗', points: 10, allowanceAmount: 200, taskDate: today(),
  })).json.task;
  ok(hw.allowanceAmount === 200, `任务带 allowanceAmount=200 分（实际 ${hw.allowanceAmount}）`);

  const childList = await child('GET', `/api/tasks?childId=${childId}&date=${today()}`);
  const childTask = childList.json.items.find((t) => t.id === hw.id);
  ok(childTask?.allowanceAmount === 200, '孩子端能看到该任务奖励 2 元零花钱');

  ok((await balance()) === 0, '审批前零花钱余额为 0');
  await child('POST', `/api/tasks/${hw.id}/submit`, { completionNote: '背完了' });
  await parent('POST', `/api/tasks/${hw.id}/review`, { approved: true });
  ok((await balance()) === 200, `审批通过后零花钱 +200 分（实际 ${await balance()}）`);

  const txs = (await parent('GET', `/api/allowance/transactions?childId=${childId}&page=1&pageSize=10`)).json;
  const rewardTx = txs.items?.find((t) => t.relatedId === hw.id);
  ok(!!rewardTx, '零花钱流水里能找到这笔任务奖励');
  ok(rewardTx?.changeAmount === 200 && rewardTx?.type === 'income', `流水为收入 +200（实际 ${rewardTx?.changeAmount}/${rewardTx?.type}）`);
  ok(rewardTx?.relatedType === 'task', `流水关联类型为 task（实际 ${rewardTx?.relatedType}）`);
  ok(String(rewardTx?.reason).includes('背古诗'), `流水备注含任务名：${rewardTx?.reason}`);

  const points = (await parent('GET', `/api/points/balance?childId=${childId}`)).json.balance;
  ok(points === 10, `积分照常发放 10（实际 ${points}）`);

  console.log('\n【必要任务模板配置零花钱：5 元 → 实例继承】');
  const tpl = (await parent('POST', '/api/tasks/templates', {
    name: '每日整理书包', defaultPoints: 5, allowanceAmount: 500, isDaily: true, frequency: 'daily',
  })).json.template;
  ok(tpl?.allowanceAmount === 500, `模板保存了 allowanceAmount=500（实际 ${tpl?.allowanceAmount}）`);

  await parent('POST', '/api/tasks/generate-daily', { childId, date: today() });
  const dailyList = (await parent('GET', `/api/tasks?childId=${childId}&date=${today()}&type=daily`)).json.items;
  const daily = dailyList.find((t) => t.name === '每日整理书包');
  ok(daily?.allowanceAmount === 500, `生成的实例继承 5 元（实际 ${daily?.allowanceAmount}）`);

  await child('POST', `/api/tasks/${daily.id}/submit`, {});
  await parent('POST', `/api/tasks/${daily.id}/review`, { approved: true });
  ok((await balance()) === 700, `必要任务审批后累计 700 分（实际 ${await balance()}）`);

  console.log('\n【编辑任务 / 模板可改金额】');
  const updated = (await parent('PATCH', `/api/tasks/${hw.id}`, { allowanceAmount: 100 })).json.task;
  ok(updated.allowanceAmount === 100, `任务金额改为 1 元（实际 ${updated.allowanceAmount}）`);
  const tpl2 = (await parent('PATCH', `/api/tasks/templates/${tpl.id}`, { allowanceAmount: 0 })).json.template;
  ok(tpl2.allowanceAmount === 0, `模板金额可改为 0（实际 ${tpl2.allowanceAmount}）`);

  console.log('\n【未配置零花钱的任务：不产生零花钱流水】');
  const before = (await parent('GET', `/api/allowance/transactions?childId=${childId}&page=1&pageSize=50`)).json.items.length;
  const plain = (await parent('POST', '/api/tasks/goal', {
    childId, name: '跳绳', points: 8, targetValue: 100, unit: '个', taskDate: today(),
  })).json.task;
  ok(plain.allowanceAmount === 0, '未填时默认为 0');
  await child('POST', `/api/tasks/${plain.id}/goal-progress`, { delta: 100 });
  await parent('POST', `/api/tasks/${plain.id}/review`, { approved: true });
  const after = (await parent('GET', `/api/allowance/transactions?childId=${childId}&page=1&pageSize=50`)).json.items.length;
  ok(after === before, `未配置时不写零花钱流水（${before} → ${after}）`);

  console.log('\n【非法金额被拒】');
  const neg = await parent('POST', '/api/tasks/homework', {
    childId, name: '负数测试', points: 1, allowanceAmount: -100, taskDate: today(),
  }, { expectError: true });
  ok(neg.status === 400, `负数金额被拒（${neg.status}）`);

  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  console.log('childId=' + childId);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('测试异常', e); process.exit(1); });
