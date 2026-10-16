/**
 * 安全回归：跨家庭越权审核习惯打卡（对应提交 43b17e4 修复的缺陷）。
 *
 * 背景：reviewHabitCheckin 原先把「发奖/置 approved」放在 assertChild 之前，
 * 校验失败时事务已提交——B 家庭家长只要拿到 checkinId，就能给 A 家庭的孩子
 * 发奖励并替他完成审批。修复后授权前置于变更。
 *
 * 本脚本不只断言 HTTP 状态码，而是**直接读库**确认「没有任何写入发生」：
 * 只看 404 是不够的，缺陷版本同样返回 404 却已写入。
 *
 * 用法（二选一）：
 *   1) bash scripts/dev-local.sh start
 *   2) node scripts/dev-pglite-db.mjs            # 无 Postgres 时
 *      然后：node scripts/test-habit-idor.mjs
 *
 * 可用环境变量：
 *   E2E_BASE_URL        被测服务地址（默认 http://localhost:8080）
 *   SUDA_DATABASE_URL   直连数据库做写入验证（默认 PGlite 的 55432）
 */
import postgres from 'postgres';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:8080';
const DSN =
  process.env.SUDA_DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:55432/postgres';
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

(async () => {
  const cfg = await (await fetch(`${BASE}/api/auth/config`)).json().catch(() => ({}));
  console.log(`\n【环境】${BASE}，APP_LOGIN=${cfg.loginEnabled === true}`);
  if (cfg.loginEnabled !== true) {
    console.log('   ⚠️  该脚本需要 APP_LOGIN=true（两个独立身份），请用 scripts/dev-local.sh start。');
    process.exit(2);
  }

  let sql;
  try {
    sql = postgres(DSN, { max: 2 });
    await sql`select 1`;
  } catch (err) {
    console.log(`   ⚠️  无法连接数据库（${DSN}）：${String(err).split('\n')[0]}`);
    console.log('      本脚本必须直连数据库验证「无写入」，请设置 SUDA_DATABASE_URL。');
    process.exit(2);
  }

  const pa = makeClient();
  const kid = makeClient();
  const pb = makeClient();

  console.log('\n【A】建立 A 家庭：家长 + 孩子 + 「需家长确认」习惯任务（50 积分）');
  const regA = await pa('POST', '/api/auth/register', {
    username: `idpa${stamp}`,
    password: PWD,
    role: 'parent',
    familyName: 'A 家庭',
  });
  if (regA.status === 429) {
    console.log('   ⚠️  注册被限流（每小时 10 次，内存计数随重启清空），请重启被测服务后重试。');
    process.exit(2);
  }
  ok(regA.status < 400, `家长A注册 ${regA.status}`);
  const childA = (await pa('POST', '/api/children', { name: 'A 娃' })).json?.child?.id;
  ok(!!childA, `孩子A childId=${childA}`);
  await pa('POST', '/api/auth/child-account', { childId: childA, username: `idka${stamp}`, password: PWD });
  const habit = (
    await pa('POST', '/api/tasks/habit', {
      childId: childA,
      name: 'A 娃的阅读打卡',
      points: 50,
      needApproval: true,
      taskDate: today(),
    })
  ).json?.task;
  ok(!!habit?.id, `习惯任务 taskId=${habit?.id}`);

  console.log('\n【B】孩子A 打卡（应只登记待确认，不发奖）');
  const loginKid = await kid('POST', '/api/auth/login', { username: `idka${stamp}`, password: PWD });
  ok(loginKid.status === 200, `孩子A登录 ${loginKid.status}`);
  const chk = await kid('POST', `/api/tasks/${habit.id}/habit-check`, {});
  ok(chk.json?.pendingApproval === true, `pendingApproval=true（实际 ${chk.json?.pendingApproval}）`);
  const checkinsBefore = await sql`select id, status from habit_checkin where child_id = ${childA}`;
  ok(checkinsBefore.length === 1, `库中存在 1 条打卡（实际 ${checkinsBefore.length}）`);
  const checkinId = checkinsBefore[0].id;

  /** 直连数据库取真实状态（HTTP 读路径不足以证明「无写入」） */
  const snapshot = async () => {
    const [c] = await sql`select points from child where id = ${childA}`;
    const rows = await sql`select status from habit_checkin where child_id = ${childA}`;
    const [t] = await sql`select count(*)::int as n from point_transaction where child_id = ${childA}`;
    return { points: c.points, status: rows[0]?.status, txCount: t.n };
  };
  const before = await snapshot();
  ok(before.points === 0 && before.status === 'pending' && before.txCount === 0,
    `越权前基线：points=${before.points} status=${before.status} 流水=${before.txCount}`);

  console.log('\n【C】B 家庭家长尝试审核 A 家庭的打卡（越权）');
  const regB = await pb('POST', '/api/auth/register', {
    username: `idpb${stamp}`,
    password: PWD,
    role: 'parent',
    familyName: 'B 家庭',
  });
  ok(regB.status < 400, `家长B注册（另一家庭）${regB.status}`);
  const meB = await pb('GET', '/api/auth/me');
  ok(meB.status === 200 && meB.json?.user?.role === 'parent', `家长B会话有效 role=${meB.json?.user?.role}`);

  const attack = await pb('POST', `/api/tasks/habit-checkins/${checkinId}/review`, { approved: true }, { expectError: true });
  ok(attack.status === 404, `越权审核被拒 404（实际 ${attack.status}）`);

  console.log('\n【D】直连数据库验证「无写入发生」（本次回归的核心断言）');
  const after = await snapshot();
  ok(after.points === before.points, `积分未变：${before.points} → ${after.points}`);
  ok(after.status === 'pending', `打卡仍为 pending（实际 ${after.status}）`);
  ok(after.txCount === before.txCount, `未产生积分流水：${before.txCount} → ${after.txCount}`);

  console.log('\n【E】对照组：A 家庭家长自己审核应成功（确认修复没有挡住正常流程）');
  const legit = await pa('POST', `/api/tasks/habit-checkins/${checkinId}/review`, { approved: true });
  ok(legit.status < 400, `家长A审核通过 ${legit.status}`);
  const final = await snapshot();
  ok(final.points === before.points + 50, `积分正确发放 +50（实际 ${final.points}）`);
  ok(final.status === 'approved', `打卡状态 approved（实际 ${final.status}）`);

  await sql.end();
  console.log(`\n========== 安全回归：${pass} 通过 / ${fail} 失败 ==========`);
  process.exit(fail === 0 ? 0 : 1);
})();
