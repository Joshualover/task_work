/**
 * 核心链路端到端回归：注册家长 → 建孩子 → 建孩子账号 → 布置作业 → 孩子提交 → 家长审核
 * → 校验积分到账与流水一致 → 重复审核幂等。
 *
 * 用法（二选一）：
 *   1) bash scripts/dev-local.sh start           # 用本机 PostgreSQL
 *   2) node scripts/dev-pglite-db.mjs            # 无 Postgres 时用 PGlite，再另起服务
 *      然后：node scripts/test-core-flow.mjs
 *
 * 可用环境变量：
 *   E2E_BASE_URL   被测服务地址（默认 http://localhost:8080）
 */
const BASE = process.env.E2E_BASE_URL || 'http://localhost:8080';
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

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
const parentUser = `cfp${stamp}`;
const childUser = `cfk${stamp}`;

(async () => {
  const cfg = await (await fetch(`${BASE}/api/auth/config`)).json().catch(() => ({}));
  console.log(`\n【环境】${BASE}，APP_LOGIN=${cfg.loginEnabled === true}`);
  if (cfg.loginEnabled !== true) {
    console.log(
      '   ⚠️  该脚本需要 APP_LOGIN=true（两个独立身份）。请用 scripts/dev-local.sh start\n' +
        '      或自行启动服务时设置 APP_LOGIN=true 与 SESSION_SECRET。',
    );
    process.exit(2);
  }

  const parent = makeClient();
  const child = makeClient();

  console.log('\n【1】家长注册（自动创建家庭）');
  const reg = await parent('POST', '/api/auth/register', {
    username: parentUser,
    password: PWD,
    displayName: '回归家长',
    role: 'parent',
    familyName: '回归家庭',
  });
  if (reg.status === 429) {
    console.log('   ⚠️  注册被限流（/api/auth/register 每小时 10 次，内存计数随重启清空）。');
    console.log('      请重启被测服务后重试。');
    process.exit(2);
  }
  ok(reg.status === 201 || reg.status === 200, `注册返回 ${reg.status}`);
  ok(reg.json?.user?.role === 'parent', `角色为 parent（实际 ${reg.json?.user?.role}）`);

  console.log('\n【2】创建孩子');
  const childId = (await parent('POST', '/api/children', { name: '回归娃' })).json?.child?.id;
  ok(!!childId, `childId=${childId}`);

  console.log('\n【3】为孩子创建登录账号');
  const acc = await parent('POST', '/api/auth/child-account', {
    childId,
    username: childUser,
    password: PWD,
  });
  ok(acc.status === 201 || acc.status === 200, `创建账号返回 ${acc.status}`);

  console.log('\n【4】家长布置作业任务（10 积分）');
  const task = (
    await parent('POST', '/api/tasks/homework', {
      childId,
      name: '回归数学练习册',
      subject: '数学',
      points: 10,
      taskDate: today(),
    })
  ).json?.task;
  ok(!!task?.id, `taskId=${task?.id}`);

  console.log('\n【5】孩子登录');
  const login = await child('POST', '/api/auth/login', { username: childUser, password: PWD });
  ok(login.status === 200 && login.json?.user?.role === 'child', `登录返回 ${login.status}，角色 ${login.json?.user?.role}`);

  const balance = async () => (await child('GET', `/api/points/balance?childId=${childId}`)).json?.balance;
  const before = await balance();
  ok(typeof before === 'number', `初始积分 ${before}`);

  console.log('\n【6】孩子提交任务');
  const submit = await child('POST', `/api/tasks/${task.id}/submit`, { completionNote: '写完了' });
  ok(submit.status < 400, `提交返回 ${submit.status}`);
  ok(submit.json?.task?.status === 'submitted', `状态 submitted（实际 ${submit.json?.task?.status}）`);

  console.log('\n【7】家长审核通过');
  const review = await parent('POST', `/api/tasks/${task.id}/review`, { approved: true });
  ok(review.status < 400, `审核返回 ${review.status}`);
  ok(review.json?.task?.status === 'completed', `状态 completed（实际 ${review.json?.task?.status}）`);
  ok(review.json?.task?.finalPoints === 10, `finalPoints=10（实际 ${review.json?.task?.finalPoints}）`);

  console.log('\n【8】积分到账');
  const after = await balance();
  ok(after === before + 10, `积分 ${before} → ${after}`);

  console.log('\n【9】积分流水与余额一致');
  const tx = (
    await child('GET', `/api/points/transactions?childId=${childId}&page=1&pageSize=10`)
  ).json?.items?.find((t) => t.relatedId === task.id);
  ok(!!tx, '找到该任务的流水');
  ok(tx?.changeAmount === 10, `changeAmount=10（实际 ${tx?.changeAmount}）`);
  ok(tx?.balanceAfter === after, `balanceAfter 与真实余额一致（${tx?.balanceAfter} vs ${after}）`);

  console.log('\n【10】重复审核幂等（不得重复发放）');
  const again = await parent('POST', `/api/tasks/${task.id}/review`, { approved: true }, { expectError: true });
  ok(again.status === 400 || again.status === 409, `重复审核被拒 ${again.status}`);
  const finalBalance = await balance();
  ok(finalBalance === after, `积分未被重复发放（${finalBalance}，应为 ${after}）`);

  console.log(`\n========== 核心链路：${pass} 通过 / ${fail} 失败 ==========`);
  process.exit(fail === 0 ? 0 : 1);
})();
