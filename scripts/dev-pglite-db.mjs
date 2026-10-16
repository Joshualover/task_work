/**
 * 无 PostgreSQL 时的本地开发数据库：PGlite（WASM 版真实 Postgres）+ Postgres 线协议服务。
 * 让 scripts/test-*.mjs 这类回归脚本在没有本机 Postgres 的机器上也能跑起来。
 *
 * 用法：
 *   node scripts/dev-pglite-db.mjs                 # 默认端口 55432，数据目录 /tmp/task-work-pglite
 *   node scripts/dev-pglite-db.mjs --fresh         # 清空并重建（重跑建表脚本 + 全部迁移）
 *   node scripts/dev-pglite-db.mjs --port 55432 --dir /tmp/my-pg
 *
 * 依赖未随仓库安装（按需装，不改 package.json）：
 *   npm i --no-save @electric-sql/pglite @electric-sql/pglite-socket
 *
 * 启动后另开终端起服务（DSN 与端口保持一致）：
 *   SUDA_DATABASE_URL='postgres://postgres:postgres@127.0.0.1:55432/postgres' \
 *   APP_LOGIN=true SESSION_SECRET='local-dev-session-secret-please-change-32' \
 *   ENABLE_CSRF=false FORCE_AUTHN_INNERAPI_DOMAIN='http://127.0.0.1:9' \
 *   SERVER_HOST=127.0.0.1 SERVER_PORT=8080 node dist/server/main.js
 *
 * 注意：PGlite 是单连接数据库，服务端靠多路复用支持并发连接。
 * maxConnections 默认仅 1，而应用侧的 postgres-js 会开连接池；
 * 不放开会表现为第二个连接被 ECONNRESET（应用侧看到 500）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const hasFlag = (f) => argv.includes(f);
const argOf = (f, dflt) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};

const FRESH = hasFlag('--fresh');
const PORT = Number(argOf('--port', '55432'));
const DATA_DIR = argOf('--dir', '/tmp/task-work-pglite');

let PGlite;
let PGLiteSocketServer;
try {
  ({ PGlite } = await import('@electric-sql/pglite'));
  ({ PGLiteSocketServer } = await import('@electric-sql/pglite-socket'));
} catch {
  console.error(
    '缺少 PGlite 依赖。请先执行：\n' +
      '  npm i --no-save @electric-sql/pglite @electric-sql/pglite-socket',
  );
  process.exit(1);
}

if (FRESH) {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  console.log(`[init] 已清空数据目录 ${DATA_DIR}`);
}
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = await PGlite.create({ dataDir: DATA_DIR });

// 1) 建表脚本（严格对齐 server/database/schema.ts）
const bootstrap = path.join(ROOT, 'server/database/migrations/local-dev-bootstrap.sql');
try {
  await db.exec(fs.readFileSync(bootstrap, 'utf8'));
  console.log('[init] local-dev-bootstrap.sql 已应用');
} catch (err) {
  console.error('[init] 建表脚本执行失败：', String(err).slice(0, 600));
  process.exit(1);
}

// 2) 后续迁移（幂等；个别迁移含平台专有语法，失败只告警不中断）
const migDir = path.join(ROOT, 'server/database/migrations');
for (const f of fs.readdirSync(migDir).filter((x) => x.endsWith('.sql') && x !== path.basename(bootstrap)).sort()) {
  try {
    await db.exec(fs.readFileSync(path.join(migDir, f), 'utf8'));
    console.log(`[migrate] ${f} OK`);
  } catch (err) {
    console.warn(`[migrate] ${f} 跳过：${String(err).split('\n')[0].slice(0, 160)}`);
  }
}

const { rows } = await db.query(
  `select tablename from pg_tables where schemaname = 'public' order by tablename`,
);
console.log(`[tables] ${rows.map((r) => r.tablename).join(', ')}`);

const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1', maxConnections: 10 });
await server.start();
console.log(`\n[socket] Postgres 线协议已监听 127.0.0.1:${PORT}`);
console.log(`[dsn]    postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    console.log(`\n[exit] 收到 ${sig}，正在关闭…`);
    await server.stop().catch(() => {});
    await db.close().catch(() => {});
    process.exit(0);
  });
}
