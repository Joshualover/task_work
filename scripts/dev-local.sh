#!/usr/bin/env bash
# ============================================================================
# 本地一键启动（无平台环境）
#   PostgreSQL(embedded-postgres) + 建表 + NestJS + Vite
#
# 用法:
#   scripts/dev-local.sh start    # 启动（默认）
#   scripts/dev-local.sh stop     # 停止
#   scripts/dev-local.sh status   # 查看状态
#
# 可用环境变量覆盖:
#   LOCAL_DEV_DIR         本地运行目录（默认 <项目根>/.local-dev）
#   LOCAL_PG_PORT         本地 PG 端口（默认 5432）
#   LOCAL_PG_USER/PASSWORD/DATABASE
#   SERVER_PORT           后端端口（默认 3000）
#   CLIENT_DEV_PORT       前端端口（默认 8080）
#   AI_SETTING_ENCRYPTION_KEY    AI 密钥加密密钥（默认本地固定值）
#   SUDA_WEBUSER                 本地用户身份（默认 local-dev-user）
#
# 说明:
#   * 若目标 PG 端口已有 PostgreSQL 在监听，则复用，不再拉起 embedded-postgres；
#     此时 stop 不会去停这个外部实例。
#   * 本脚本仅用于本地开发，建表脚本不包含平台 RLS 策略。
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LOCAL_DIR="${LOCAL_DEV_DIR:-$ROOT/.local-dev}"
PG_PKG="$LOCAL_DIR/pg"        # embedded-postgres / pg 的安装目录
PG_DATA="$LOCAL_DIR/pgdata"   # PG 数据目录
LOG_DIR="$ROOT/logs"
mkdir -p "$LOCAL_DIR" "$LOG_DIR"

PG_PORT="${LOCAL_PG_PORT:-5432}"
PG_USER="${LOCAL_PG_USER:-u}"
PG_PASSWORD="${LOCAL_PG_PASSWORD:-p}"
PG_DATABASE="${LOCAL_PG_DATABASE:-db}"
SERVER_PORT="${SERVER_PORT:-3000}"
CLIENT_DEV_PORT="${CLIENT_DEV_PORT:-8080}"

DEFAULT_WEBUSER='{"user_id":"local-dev-user","app_id":"local","user_name":{"zh_cn":"本地用户"},"is_system_account":false}'

export SUDA_DATABASE_URL="${SUDA_DATABASE_URL:-postgres://$PG_USER:$PG_PASSWORD@127.0.0.1:$PG_PORT/$PG_DATABASE}"
export FORCE_AUTHN_INNERAPI_DOMAIN="${FORCE_AUTHN_INNERAPI_DOMAIN:-http://127.0.0.1:9}"
export MIAODA_APP_TYPE=3
export MIAODA_LOCAL_DEV=1
export AI_SETTING_ENCRYPTION_KEY="${AI_SETTING_ENCRYPTION_KEY:-local-dev-encryption-key-32chars!!}"

# 应用级登录（默认开启）：本地也会出现登录页
# 开启后身份来自登录会话，不能再注入固定用户头，否则会串号。
export APP_LOGIN="${APP_LOGIN:-true}"
export SESSION_SECRET="${SESSION_SECRET:-local-dev-session-secret-please-change-32}"
if [ "$APP_LOGIN" = "true" ]; then
  unset SUDA_WEBUSER
else
  export SUDA_WEBUSER="${SUDA_WEBUSER:-$DEFAULT_WEBUSER}"
fi

MIGRATION="$ROOT/server/database/migrations/local-dev-bootstrap.sql"

# ---------------------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------------------
port_pids() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti "tcp:$port" 2>/dev/null || true
  else
    netstat -ano 2>/dev/null \
      | grep -E "[:.]$port[[:space:]]+.*LISTENING" \
      | awk '{print $NF}' | sort -u || true
  fi
}

port_open() {
  node "$LOCAL_DIR/port-open.js" "$1" >/dev/null 2>&1
}

kill_pid() {
  local pid="${1:-}"
  [ -z "$pid" ] && return 0
  if command -v taskkill >/dev/null 2>&1; then
    taskkill //F //T //PID "$pid" >/dev/null 2>&1 || true
  else
    kill "$pid" >/dev/null 2>&1 || true
  fi
}

write_helpers() {
  cat > "$LOCAL_DIR/port-open.js" <<'EOF'
const net = require('net');
const port = Number(process.argv[2]);
const hosts = ['127.0.0.1', '::1', 'localhost'];
let i = 0;
(function next() {
  if (i >= hosts.length) process.exit(1);
  const host = hosts[i++];
  const s = net.connect({ host, port }, () => { s.end(); process.exit(0); });
  s.on('error', next);
  s.setTimeout(800, () => { s.destroy(); next(); });
})();
EOF
}

ensure_embedded_pg() {
  if [ ! -d "$PG_PKG/node_modules/embedded-postgres" ]; then
    echo "[db] 首次安装 embedded-postgres（会下载便携版 PostgreSQL，稍慢）..."
    mkdir -p "$PG_PKG"
    ( cd "$PG_PKG" && npm init -y >/dev/null 2>&1 && npm install embedded-postgres pg --no-audit --no-fund )
  fi
  cat > "$PG_PKG/pg-start.js" <<'EOF'
const fs = require('fs');
const EmbeddedPostgres = require('embedded-postgres').default;
(async () => {
  const pg = new EmbeddedPostgres({
    databaseDir: process.env.PG_DATA,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    port: Number(process.env.PG_PORT),
    persistent: true,
    authMethod: 'scram-sha-256',
  });
  if (!fs.existsSync(process.env.PG_DATA + '/PG_VERSION')) {
    console.log('[db] initdb ...');
    await pg.initialise();
  }
  await pg.start();
  console.log('[db] ready on 127.0.0.1:' + process.env.PG_PORT);
  process.on('SIGTERM', async () => { try { await pg.stop(); } catch {} process.exit(0); });
  process.on('SIGINT', async () => { try { await pg.stop(); } catch {} process.exit(0); });
  setInterval(() => {}, 1 << 30);
})().catch((e) => { console.error('[db] failed:', e); process.exit(1); });
EOF
}

# ---------------------------------------------------------------------------
# 各阶段
# ---------------------------------------------------------------------------
start_db() {
  if port_open "$PG_PORT"; then
    echo "[db] 端口 $PG_PORT 已有 PostgreSQL，复用"
    return 0
  fi
  ensure_embedded_pg
  echo "[db] 启动 PostgreSQL (:${PG_PORT}) ..."
  PG_DATA="$PG_DATA" PG_USER="$PG_USER" PG_PASSWORD="$PG_PASSWORD" \
  PG_PORT="$PG_PORT" PG_DATABASE="$PG_DATABASE" \
    nohup node "$PG_PKG/pg-start.js" > "$LOG_DIR/pg.log" 2>&1 &
  touch "$LOCAL_DIR/pg.started"

  for _ in $(seq 1 60); do
    if port_open "$PG_PORT"; then
      echo "[db] PostgreSQL 就绪"
      return 0
    fi
    sleep 1
  done
  echo "[db] ❌ 启动超时，见 $LOG_DIR/pg.log"
  exit 1
}

apply_schema() {
  cat > "$PG_PKG/apply-sql.js" <<'EOF'
const fs = require('fs');
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.SUDA_DATABASE_URL });
  await c.connect();
  await c.query(fs.readFileSync(process.argv[2], 'utf8'));
  await c.end();
  console.log('[db] schema applied');
})().catch((e) => { console.error('[db] apply failed:', e.message); process.exit(1); });
EOF
  echo "[db] 应用建表脚本 ..."
  node "$PG_PKG/apply-sql.js" "$MIGRATION"
}

ensure_pg_client() {
  if [ ! -d "$PG_PKG/node_modules/pg" ]; then
    mkdir -p "$PG_PKG"
    ( cd "$PG_PKG" && npm init -y >/dev/null 2>&1 && npm install pg --no-audit --no-fund )
  fi
}

# 确保目标数据库存在（避免与 embedded-postgres 的 createDatabase 竞争）
ensure_database() {
  ensure_pg_client
  cat > "$PG_PKG/ensure-db.js" <<'EOF'
const { Client } = require('pg');
const target = new URL(process.env.SUDA_DATABASE_URL);
const dbName = decodeURIComponent(target.pathname.replace(/^\//, ''));
const admin = new URL(process.env.SUDA_DATABASE_URL);
admin.pathname = '/postgres';
(async () => {
  for (let i = 0; i < 30; i++) {
    try {
      const c = new Client({ connectionString: admin.toString() });
      await c.connect();
      const r = await c.query('select 1 from pg_database where datname = $1', [dbName]);
      if (r.rowCount === 0) await c.query('CREATE DATABASE "' + dbName.replace(/"/g, '""') + '"');
      await c.end();
      console.log('[db] database ready: ' + dbName);
      return;
    } catch {
      await new Promise((res) => setTimeout(res, 1000));
    }
  }
  console.error('[db] ensure database timeout');
  process.exit(1);
})();
EOF
  node "$PG_PKG/ensure-db.js"
}

start_apps() {
  echo "[app] 启动后端 (:${SERVER_PORT}) ..."
  nohup npm run dev:server > "$LOG_DIR/dev-server.log" 2>&1 &
  echo $! > "$LOCAL_DIR/server.pid"

  echo "[app] 启动前端 (:${CLIENT_DEV_PORT}) ..."
  nohup npm run dev:client > "$LOG_DIR/dev-client.log" 2>&1 &
  echo $! > "$LOCAL_DIR/client.pid"
}

wait_apps() {
  for _ in $(seq 1 90); do
    if port_open "$SERVER_PORT"; then break; fi
    sleep 1
  done
  if ! port_open "$SERVER_PORT"; then
    echo "[app] ❌ 后端启动超时，见 $LOG_DIR/dev-server.log"
    exit 1
  fi
  for _ in $(seq 1 60); do
    if port_open "$CLIENT_DEV_PORT"; then break; fi
    sleep 1
  done
  if ! port_open "$CLIENT_DEV_PORT"; then
    echo "[app] ❌ 前端启动超时，见 $LOG_DIR/dev-client.log"
    exit 1
  fi
}

stop_all() {
  echo "[stop] 停止应用 ..."
  cleanup_app_processes

  if [ -f "$LOCAL_DIR/pg.started" ]; then
    echo "[stop] 停止 PostgreSQL ..."
    kill_project_node_procs 'pg-start'
    for pid in $(port_pids "$PG_PORT"); do kill_pid "$pid"; done
    rm -f "$LOCAL_DIR/pg.started"
  else
    echo "[stop] PostgreSQL 非本脚本启动，跳过"
  fi
  echo "[stop] 完成"
}

# 杀本项目残留的 node 进程（watcher / pg-start）。Windows 下命令行斜杠风格不一，
# 同时匹配反斜杠 / 正斜杠两种路径形式。
kill_project_node_procs() {
  local pattern="$1"
  if command -v powershell >/dev/null 2>&1; then
    local rootWin rootFwd
    rootWin="$(cygpath -w "$ROOT" 2>/dev/null || printf '%s' "$ROOT")"
    rootFwd="${rootWin//\\//}"
    powershell -NoProfile -Command "
      Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" |
      Where-Object {
        \$_.CommandLine -and
        (\$_.CommandLine -like '*$rootWin*' -or \$_.CommandLine -like '*$rootFwd*') -and
        (\$_.CommandLine -match '$pattern')
      } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force }
    " >/dev/null 2>&1 || true
  else
    pkill -f "$ROOT.*($pattern)" 2>/dev/null || true
  fi
}

# 清理应用进程：端口占用 + 残留 watcher（nest --watch / vite / cross-env）
cleanup_app_processes() {
  for port in "$SERVER_PORT" "$CLIENT_DEV_PORT"; do
    for pid in $(port_pids "$port"); do kill_pid "$pid"; done
  done
  kill_project_node_procs 'nest|vite|cross-env'
  for f in "$LOCAL_DIR/server.pid" "$LOCAL_DIR/client.pid"; do
    if [ -f "$f" ]; then kill_pid "$(cat "$f")"; rm -f "$f"; fi
  done
}

status() {
  echo "服务状态:"
  local pair name port
  for pair in "PostgreSQL:$PG_PORT" "后端:$SERVER_PORT" "前端:$CLIENT_DEV_PORT"; do
    name="${pair%%:*}"; port="${pair##*:}"
    if port_open "$port"; then
      echo "  ✅ $name  :$port"
    else
      echo "  ❌ $name  :$port"
    fi
  done
}

write_helpers

case "${1:-start}" in
  start)
    cleanup_app_processes
    start_db
    ensure_database
    apply_schema
    start_apps
    wait_apps
    echo
    echo "✅ 本地开发环境已启动"
    echo "   访问:  http://localhost:$CLIENT_DEV_PORT/"
    echo "   日志:  $LOG_DIR/{pg,dev-server,dev-client}.log"
    echo "   停止:  $0 stop"
    echo
    status
    ;;
  stop) stop_all ;;
  status) status ;;
  *)
    echo "用法: $0 {start|stop|status}"
    exit 1
    ;;
esac
