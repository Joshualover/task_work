/**
 * 兑换链路回归：发起兑换 → 限额拦截 → 审批扣分（覆盖本轮 M13 事务内限额校验的改动）。
 * 用法：bash scripts/dev-local.sh start 之后 node scripts/test-redemption.mjs
 */
const BASE = 'http://localhost:8080';

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
  await parent('POST', '/api/auth/register', { username: 'rdp', password: '123456', role: 'parent' });
  const childId = (await parent('POST', '/api/children', { name: '兑换娃' })).json.child.id;
  await parent('POST', '/api/auth/child-account', { childId, username: 'rdk', password: '123456' });
  const child = makeClient();
  await child('GET', '/', undefined, { accept: 'text/html' });
  await child('POST', '/api/auth/login', { username: 'rdk', password: '123456' });

  console.log('\n【准备积分与奖励】');
  const adj = await parent('POST', '/api/points/adjust', {
    childId, changeAmount: 100, reason: '测试发分',
  });
  ok(adj.status < 400, `给孩子发放 100 积分（${adj.status}）`);
  const balance0 = (await parent('GET', `/api/points/balance?childId=${childId}`)).json.balance;
  ok(balance0 === 100, `余额 100（实际 ${balance0}）`);

  const reward = (await parent('POST', '/api/rewards', {
    name: '看动画片', pointsRequired: 30, description: '周末看一集',
    frequency: 'daily', limitCount: 1, limitPoints: 50,
  })).json;
  const rewardId = reward.reward?.id ?? reward.id;
  ok(!!rewardId, `创建奖励（每日限 1 次）${rewardId}`);

  console.log('\n【兑换 → 审批 → 扣分】');
  const r1 = await child('POST', '/api/redemptions', { rewardId, childId });
  ok(r1.status < 400, `孩子发起兑换 ${r1.status}`);
  const redId = r1.json.redemption?.id ?? r1.json.id;
  const approve = await parent('POST', `/api/redemptions/${redId}/review`, { approved: true });
  ok(approve.status < 400, `家长审批通过 ${approve.status}`);
  const balance1 = (await parent('GET', `/api/points/balance?childId=${childId}`)).json.balance;
  ok(balance1 === 70, `扣分后余额 70（实际 ${balance1}）`);
  const tx = (await parent('GET', `/api/points/transactions?childId=${childId}&page=1&pageSize=10`)).json;
  ok(
    tx.items?.some((t) => t.type === 'spend' && t.changeAmount === -30),
    '积分流水记录了 -30 的消耗',
  );

  console.log('\n【限额拦截（每日 1 次）】');
  const r2 = await child('POST', '/api/redemptions', { rewardId, childId }, { expectError: true });
  ok(r2.status >= 400, `第二次兑换被限额拦截（${r2.status}）`);
  ok(
    JSON.stringify(r2.json).includes('最多兑换'),
    `提示文案正确：${JSON.stringify(r2.json).slice(0, 120)}`,
  );

  console.log('\n【积分不足拦截】');
  const expensive = (await parent('POST', '/api/rewards', {
    name: '豪华大礼', pointsRequired: 99999, description: '买不起',
  })).json;
  const expensiveId = expensive.reward?.id ?? expensive.id;
  const r3 = await child('POST', '/api/redemptions', { rewardId: expensiveId, childId }, { expectError: true });
  ok(r3.status >= 400, `积分不足被拦（${r3.status}）`);

  console.log('\n【分页参数 NaN 兜底（M14）】');
  const badPage = await parent('GET', `/api/points/transactions?childId=${childId}&page=abc&pageSize=xyz`);
  ok(badPage.status < 400, `page=abc 不再 500（${badPage.status}）`);

  console.log('\n【越权：他人家庭不能审批】');
  const other = makeClient();
  await other('GET', '/', undefined, { accept: 'text/html' });
  await other('POST', '/api/auth/register', { username: 'rdq', password: '123456', role: 'parent' });
  const r4 = await child('POST', '/api/redemptions', { rewardId: expensiveId, childId }, { expectError: true });
  ok(r4.status >= 400, `（前置）再试一次仍被拦 ${r4.status}`);

  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  console.log('childId=' + childId);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('测试异常', e); process.exit(1); });
