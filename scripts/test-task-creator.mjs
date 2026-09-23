/**
 * 「谁布置的任务」回归测试：多家长场景下 creatorName 要能区分爸爸/妈妈，
 * 必要任务要继承模板创建者，孩子端能拿到 creatorName。
 * 用法：bash scripts/dev-local.sh start 之后 node scripts/test-task-creator.mjs
 */
const BASE = 'http://localhost:8080';
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

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
  const dad = makeClient('dad');
  await dad('GET', '/', undefined, { accept: 'text/html' });
  await dad('POST', '/api/auth/register', {
    username: 'cdp', password: '123456', role: 'parent', displayName: '爸爸',
  });
  const childId = (await dad('POST', '/api/children', { name: '布置娃' })).json.child.id;
  await dad('POST', '/api/auth/child-account', { childId, username: 'cdk', password: '123456' });
  const child = makeClient('child');
  await child('GET', '/', undefined, { accept: 'text/html' });
  await child('POST', '/api/auth/login', { username: 'cdk', password: '123456' });

  // 妈妈：另一个家长账号，同一家庭
  await dad('POST', '/api/auth/parent-account', {
    username: 'cdm', password: '123456', displayName: '妈妈',
  });
  const mom = makeClient('mom');
  await mom('GET', '/', undefined, { accept: 'text/html' });
  await mom('POST', '/api/auth/login', { username: 'cdm', password: '123456' });

  console.log('\n【不同家长布置，能区分开】');
  const dadTask = (await dad('POST', '/api/tasks/homework', {
    childId, name: '爸爸的语文作业', points: 10, taskDate: today(),
  })).json.task;
  ok(dadTask.creatorName === '爸爸', `爸爸布置的作业 creatorName=爸爸（实际 ${dadTask.creatorName}）`);

  const momTask = (await mom('POST', '/api/tasks/goal', {
    childId, name: '妈妈定的目标', points: 20, taskDate: today(), targetValue: 100, unit: '个',
  })).json.task;
  ok(momTask.creatorName === '妈妈', `妈妈布置的目标 creatorName=妈妈（实际 ${momTask.creatorName}）`);
  ok(
    !!dadTask.creatorUserId && !!momTask.creatorUserId && dadTask.creatorUserId !== momTask.creatorUserId,
    'creatorUserId 分别记录且不同',
  );

  const momHomework = (await mom('POST', '/api/tasks/homework', {
    childId, name: '妈妈的数学作业', points: 8, taskDate: today(),
  })).json.task;
  ok(momHomework.creatorName === '妈妈', '妈妈布置的作业 creatorName=妈妈');

  console.log('\n【必要任务继承模板创建者】');
  const tpl = (await mom('POST', '/api/tasks/templates', {
    name: '每日阅读', defaultPoints: 5, isDaily: true, frequency: 'daily',
  })).json.template;
  ok(!!tpl?.id, '妈妈创建了必要任务模板');
  // 由爸爸点击「生成每日任务」——布置人仍应是妈妈
  const gen = await dad('POST', '/api/tasks/generate-daily', { childId, date: today() });
  ok(gen.status < 400, `爸爸触发生成每日任务 ${gen.status}`);
  const dailyTasks = (await dad('GET', `/api/tasks?childId=${childId}&date=${today()}&type=daily`)).json.items;
  const reading = dailyTasks.find((t) => t.name === '每日阅读');
  ok(!!reading, '生成出「每日阅读」实例');
  ok(
    reading?.creatorName === '妈妈',
    `必要任务沿用模板创建者=妈妈（实际 ${reading?.creatorName}）`,
  );
  ok(dailyTasks.every((t) => t.creatorName), '所有必要任务实例都有布置人');

  console.log('\n【孩子端能看到布置人】');
  const childList = await child('GET', `/api/tasks?childId=${childId}&date=${today()}`);
  const items = childList.json.items;
  ok(items.length >= 4, `孩子端拿到 ${items.length} 个任务`);
  ok(items.every((t) => t.creatorName), '每个任务都带 creatorName（孩子端不会空白）');
  const names = new Set(items.map((t) => t.creatorName));
  ok(names.has('爸爸') && names.has('妈妈'), `能同时看到爸爸和妈妈的布置（${[...names].join('/')}）`);
  const byName = Object.fromEntries(items.map((t) => [t.name, t.creatorName]));
  ok(byName['爸爸的语文作业'] === '爸爸', '孩子端：爸爸的作业显示爸爸');
  ok(byName['妈妈的数学作业'] === '妈妈', '孩子端：妈妈的作业显示妈妈');
  ok(byName['妈妈定的目标'] === '妈妈', '孩子端：妈妈的目标显示妈妈');

  console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
  console.log('childId=' + childId);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('测试异常', e); process.exit(1); });
