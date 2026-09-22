const BASE = 'http://localhost:8080';
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() + 8 * 3600e3 - n * 86400e3).toISOString().slice(0, 10);

function makeClient(label) {
  let cookie = '';
  return async function req(method, path, body, opts = {}) {
    const headers = { Accept: opts.accept || 'application/json' };
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
    for (const c of (res.headers.getSetCookie?.() ?? [])) {
      const kv = c.split(';')[0];
      const k = kv.split('=')[0];
      if (cookie) cookie = cookie.split('; ').filter((x) => !x.startsWith(k + '=')).join('; ');
      cookie = cookie ? cookie + '; ' + kv : kv;
    }
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    if (res.status >= 400) console.log(`   ⚠️ ${label} ${method} ${path} -> ${res.status}`, JSON.stringify(json).slice(0, 200));
    return { status: res.status, json };
  };
}

const ok = (cond, msg) => console.log(`   ${cond ? '✅' : '❌'} ${msg}`);

(async () => {
  const parent = makeClient('parent');
  await parent('GET', '/', undefined, { accept: 'text/html' });
  const reg = await parent('POST', '/api/auth/register', { username: 'lsp', password: '123456', role: 'parent' });
  ok(reg.status < 400, `家长注册 ${reg.status}`);

  const childRes = await parent('POST', '/api/children', { name: '补提交娃' });
  const childId = childRes.json.child.id;
  ok(!!childId, `创建孩子 ${childId}`);

  const acc = await parent('POST', '/api/auth/child-account', { childId, username: 'lsk', password: '123456' });
  ok(acc.status < 400, `创建孩子账号 ${acc.status}`);

  // 1) 昨天的作业（截止日=昨天，无顺延）→ 逾期
  const hw = await parent('POST', '/api/tasks/homework', {
    childId, name: '数学作业', points: 10, taskDate: daysAgo(1), deadline: daysAgo(1),
  });
  const taskId = hw.json.task?.id ?? hw.json.id;
  ok(hw.status < 400 && !!taskId, `创建昨日作业 ${hw.status} ${taskId}`);

  // 2) 家长今天看任务池：应能看到这条「已逾期」（跨天保留）
  const parentList1 = await parent('GET', `/api/tasks?childId=${childId}&date=${today()}`);
  const t1 = parentList1.json.items.find((t) => t.id === taskId);
  ok(!!t1, '家长端能看到昨日逾期任务（跨天保留）');
  ok(t1?.status === 'overdue', `状态为 overdue（实际 ${t1?.status}）`);
  ok(t1?.isLateSubmit === false, `isLateSubmit 初始为 false（实际 ${t1?.isLateSubmit}）`);

  // 3) 孩子端也能看到
  const child = makeClient('child');
  await child('GET', '/', undefined, { accept: 'text/html' });
  const login = await child('POST', '/api/auth/login', { username: 'lsk', password: '123456' });
  ok(login.status < 400, `孩子登录 ${login.status}`);
  const childList1 = await child('GET', `/api/tasks?childId=${childId}&date=${today()}`);
  ok(!!childList1.json.items.find((t) => t.id === taskId), '孩子端能看到逾期任务');

  // 4) 孩子申请补提交（带说明）
  const submit = await child('POST', `/api/tasks/${taskId}/submit`, { completionNote: '昨天生病了，今天补上' });
  ok(submit.status < 400, `孩子申请补提交 ${submit.status}`);
  ok(submit.json.task?.status === 'submitted', `状态 submitted（实际 ${submit.json.task?.status}）`);
  ok(submit.json.task?.isLateSubmit === true, `isLateSubmit=true（实际 ${submit.json.task?.isLateSubmit}）`);

  // 5) 家长收到「补提交」提醒
  const notif = await parent('GET', '/api/notifications');
  const n = notif.json.items.find((x) => x.relatedId === taskId);
  ok(!!n, '家长收到提醒');
  ok(!!n && n.title.includes('补提交'), `提醒标题含「补提交」：${n?.title}`);
  ok(!!n && n.body.includes('昨天生病了'), `提醒正文含补提交说明：${n?.body}`);

  // 6) 家长端待确认区能看到且带补提交标记
  const parentList2 = await parent('GET', `/api/tasks?childId=${childId}&date=${today()}`);
  const t2 = parentList2.json.items.find((t) => t.id === taskId);
  ok(t2?.status === 'submitted' && t2?.isLateSubmit === true, '家长端显示为补提交待确认');
  ok(t2?.completionNote === '昨天生病了，今天补上', `补提交说明可见：${t2?.completionNote}`);

  // 7) 家长审批通过 → 完成 + 得分，且不再跨天保留
  const review = await parent('POST', `/api/tasks/${taskId}/review`, { approved: true });
  ok(review.status < 400, `家长审批通过 ${review.status}`);
  const parentList3 = await parent('GET', `/api/tasks?childId=${childId}&date=${today()}`);
  ok(!parentList3.json.items.find((t) => t.id === taskId), '审批通过后不再出现在列表（已完成）');
  const balance = await parent('GET', `/api/points/balance?childId=${childId}`);
  ok(balance.json.balance === 10, `补提交通过后积分到账 10（实际 ${balance.json.balance}）`);

  // 8) 对照：今日任务正常提交，isLateSubmit 应为 false
  const todayTask = await parent('POST', '/api/tasks/homework', {
    childId, name: '今日作业', points: 5, taskDate: today(),
  });
  const todayId = todayTask.json.task?.id;
  const normalSubmit = await child('POST', `/api/tasks/${todayId}/submit`, { completionNote: '写完了' });
  ok(normalSubmit.json.task?.isLateSubmit === false, `今日任务提交 isLateSubmit=false（实际 ${normalSubmit.json.task?.isLateSubmit}）`);

  console.log('\nchildId=' + childId);
})().catch((e) => { console.error('测试异常', e); process.exit(1); });
