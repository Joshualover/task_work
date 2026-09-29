/**
 * 安全修复验证：跨家庭 IDOR（H3）+ 伪造平台身份头（H1）。
 * 用法：bash scripts/dev-local.sh start 之后 node scripts/test-security-fixes.mjs
 */
const BASE = 'http://localhost:8080';

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
    // 允许注入伪造头，用于验证 H1
    if (opts.extraHeaders) Object.assign(headers, opts.extraHeaders);
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
    return { status: res.status, json };
  };
}

async function setupFamily(tag) {
  const parent = makeClient('parent-' + tag);
  await parent('GET', '/', undefined, { accept: 'text/html' });
  const reg = await parent('POST', '/api/auth/register', {
    username: tag + 'p', password: '123456', role: 'parent', displayName: tag + '爸',
  });
  const childId = (await parent('POST', '/api/children', { name: tag + '娃' })).json.child.id;
  await parent('POST', '/api/auth/child-account', { childId, username: tag + 'k', password: '123456' });
  const child = makeClient('child-' + tag);
  await child('GET', '/', undefined, { accept: 'text/html' });
  await child('POST', '/api/auth/login', { username: tag + 'k', password: '123456' });
  return { parent, child, childId, ownerId: reg.json.user.id, familyId: reg.json.user.familyId };
}

(async () => {
  const A = await setupFamily('sfa');
  const B = await setupFamily('sfb');

  console.log('\n【H3 跨家庭零花钱审批（IDOR）】');
  // B 家孩子有余额 → 发起申请
  const adj = await B.parent('POST', '/api/allowance/adjust', {
    childId: B.childId, changeAmount: 5000, reason: '测试充值',
  });
  ok(adj.status < 400, `B 家充值 ${adj.status}`);
  const reqA = await B.child('POST', '/api/allowance/requests', {
    childId: B.childId, amount: 1000, purpose: '买贴纸',
  });
  const requestId = reqA.json.request?.id ?? reqA.json.id;
  ok(!!requestId, `B 家孩子发起申请 ${requestId}`);

  // A 家家长尝试审批 B 家的申请 → 必须失败
  const hack = await A.parent('POST', `/api/allowance/requests/${requestId}/review`, {
    approved: true,
  });
  ok(hack.status >= 400, `A 家家长审批 B 家申请被拒（${hack.status}）`);
  ok(
    hack.status === 404 || hack.status === 403,
    `拒绝方式为 404/403 而非 5xx（${hack.status}）`,
  );
  // B 家家长自己审批应成功
  const own = await B.parent('POST', `/api/allowance/requests/${requestId}/review`, {
    approved: true,
  });
  ok(own.status < 400, `B 家家长自己审批成功 ${own.status}`);

  console.log('\n【H1 伪造平台身份头】');
  // 孩子账号伪造「我是 A 家家长」的头，尝试访问家长专属接口
  const forged = await A.child('GET', '/api/children', undefined, {
    extraHeaders: {
      'x-larkgw-suda-webuser': encodeURIComponent(
        JSON.stringify({ user_id: A.ownerId, app_id: 'app', user_name: { zh_cn: '伪造' } }),
      ),
    },
  });
  ok(forged.status === 403, `孩子伪造家长身份头仍被拒（${forged.status}）`);
  // 孩子伪造头后访问他人家庭数据
  const forgedCross = await A.child('GET', `/api/points/balance?childId=${B.childId}`, undefined, {
    extraHeaders: {
      'x-larkgw-suda-webuser': encodeURIComponent(
        JSON.stringify({ user_id: B.ownerId, app_id: 'app', user_name: { zh_cn: '伪造' } }),
      ),
    },
  });
  ok(forgedCross.status === 403, `孩子伪造头跨家庭读数据被拒（${forgedCross.status}）`);
  // A 家家长伪造 B 家身份头 → 中间件应无条件覆盖，仍看到 A 家的数据
  const parentForged = await A.parent('GET', '/api/children', undefined, {
    extraHeaders: {
      'x-larkgw-suda-webuser': encodeURIComponent(
        JSON.stringify({ user_id: B.ownerId, app_id: 'app', user_name: { zh_cn: '伪造' } }),
      ),
    },
  });
  const names = (parentForged.json.items ?? []).map((c) => c.name);
  ok(
    parentForged.status < 400 && !names.includes('sfb娃'),
    `家长伪造头无效，仍只看到自己家的孩子（${names.join(',')}）`,
  );

  console.log('\n【M1 DTO whitelist：多余字段被拦截/剥离】');
  const withExtra = await A.parent('POST', '/api/allowance/adjust', {
    childId: A.childId, changeAmount: 100, reason: '正常', isAdmin: true, hackField: 'x',
  });
  ok(withExtra.status < 400, `带多余字段的合法请求仍成功（whitelist 剥离，${withExtra.status}）`);

  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('测试异常', e); process.exit(1); });
