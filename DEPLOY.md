# 部署到 NAS（1Panel + Node.js）

本项目是**妙搭平台应用**，默认依赖平台注入的数据库、用户身份与 CSRF 网关。部署到自有 NAS 时使用**独立部署模式**：关闭平台 CSRF 校验 + 注入固定用户身份（适合单家庭自用）。

前端构建产物由后端（NestJS）直接托管，**只需要一个 Node 服务 + 一个 PostgreSQL**，无需单独部署前端。

---

## ⚡ 上线 Checklist（复制粘贴版）

**0. 前提**：1Panel 已安装；应用商店装好 PostgreSQL；运行环境装好 **Node 22+**。

**1. 建库**：1Panel →「数据库 → PostgreSQL」新建库 `task_work`（记下密码）。

**2. 克隆 + 装依赖 + 建表 + 构建**（1Panel 终端，整段复制；先改上面两个密码变量）：

```bash
set -e
cd /opt
git clone https://github.com/Joshualover/task_work.git
cd task_work
npm install --ignore-scripts

# 建表（创建表 / 复合类型 / 平台角色，需超级用户）
export SUPER_PWD='postgres超级用户密码'
psql "postgres://postgres:${SUPER_PWD}@127.0.0.1:5432/task_work" \
  -f server/database/migrations/local-dev-bootstrap.sql

# 构建（⚠️ 必须带 MIAODA_APP_TYPE=3，否则生产白屏）
MIAODA_APP_TYPE=3 npm run build:prod
```

**3. 写 `.env`**（整段复制，替换 `REPLACE_...`）：

```bash
cat > .env <<'ENV'
NODE_ENV=production
SUDA_DATABASE_URL=postgres://postgres:REPLACE_DB_PWD@127.0.0.1:5432/task_work
FORCE_AUTHN_INNERAPI_DOMAIN=http://127.0.0.1:9
STANDALONE_USER_ID=nas
STANDALONE_USER_NAME=家长
ENABLE_CSRF=false
AI_SETTING_ENCRYPTION_KEY=REPLACE_WITH_32_CHAR_RANDOM
BODY_SIZE_LIMIT=12mb
SERVER_HOST=127.0.0.1
SERVER_PORT=3000
ENV
```

**4. 守护启动（PM2）**：

```bash
npm i -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # 执行它输出的那条命令以配置开机自启
```

**5. 反向代理**：1Panel →「网站 → 创建网站 → 反向代理」→ 域名 `task.example.com` → `http://127.0.0.1:3000` → 开启 HTTPS。
Nginx 需放开请求体：`client_max_body_size 20m;`（详见第 7 节）。

**6. 验证**：

```bash
curl -s -o /dev/null -w "页面 %{http_code}\n" http://127.0.0.1:3000/
curl -s http://127.0.0.1:3000/api/children
```

> **三个最常见的坑**：① 构建漏了 `MIAODA_APP_TYPE=3` → 白屏；② 没设 `ENABLE_CSRF=false` → 接口 403；③ Nginx 没放开 `client_max_body_size` → 传图 413。

---

## 前置条件

- 1Panel 已安装（含 Docker）。
- 1Panel 应用商店安装 **PostgreSQL**（13+）。
- Node.js **>= 22**（`package.json` 要求 `node>=22`）。1Panel 的「运行环境 / Node.js 版本管理」里选 22 或更高。

---

## 步骤

### 1. 创建数据库并建表

1Panel →「数据库」→「PostgreSQL」→ 创建数据库：

- 名称：`task_work`
- 用户名 / 密码：自定义（记下，后面连接串要用）
- 访问权限：本地（`127.0.0.1`）

然后用**超级用户**（如 `postgres`）执行建表脚本：

```bash
# 在 1Panel 终端里，进入克隆后的项目目录
psql "postgres://postgres:你的超级用户密码@127.0.0.1:5432/task_work" \
  -f server/database/migrations/local-dev-bootstrap.sql
```

> 该脚本会创建 11 张表、`user_profile` / `file_attachment` 复合类型，以及平台中间件需要的角色
> `anon_` / `authenticated_` / `service_role_`。
>
> ⚠️ 创建角色需要超级用户权限。**最简单的做法是把应用连接串直接配成超级用户**（如 `postgres`）；
> 若想用普通账号，请先用超级用户执行脚本，再给该账号授权这些角色。

### 2. 拉取代码

```bash
mkdir -p /opt && cd /opt
git clone https://github.com/Joshualover/task_work.git
cd task_work
```

### 3. 安装依赖

```bash
npm install --ignore-scripts
```

> `--ignore-scripts` 用于跳过平台专用的 `postinstall`（`fullstack-cli` 在平台外不存在）。

### 4. 配置环境变量

复制示例并修改：

```bash
cp .env.example .env
```

> 应用启动时会**自动加载工作目录下的 `.env`**（已内置提前加载，`ENABLE_CSRF` / `STANDALONE_USER_ID` 等都生效），因此 PM2 / systemd / 1Panel 里不必重复配置。

`.env` 关键内容：

```env
NODE_ENV=production

# 数据库（平台变量名，这里填你自己的 PG 连接串）
SUDA_DATABASE_URL=postgres://postgres:你的密码@127.0.0.1:5432/task_work

# 平台 SDK 要求必填（占位即可，业务链路不使用）
FORCE_AUTHN_INNERAPI_DOMAIN=http://127.0.0.1:9

# 独立部署：固定用户身份（单家庭使用）
STANDALONE_USER_ID=nas
STANDALONE_USER_NAME=家长

# 关闭平台网关的 CSRF 校验
ENABLE_CSRF=false

# AI 密钥加密密钥（务必设置，>= 16 位强随机）
AI_SETTING_ENCRYPTION_KEY=请替换为强随机字符串

# 其他
BODY_SIZE_LIMIT=12mb
SERVER_HOST=127.0.0.1
SERVER_PORT=3000
```

| 变量 | 必填 | 说明 |
|---|---|---|
| `SUDA_DATABASE_URL` | ✅ | PostgreSQL 连接串（平台变量名） |
| `FORCE_AUTHN_INNERAPI_DOMAIN` | ✅ | 平台 SDK 启动必需，占位值即可 |
| `STANDALONE_USER_ID` | ✅ | 独立部署的固定用户 id；不设则请求无身份、会反复建家庭 |
| `STANDALONE_USER_NAME` |  | 显示名（默认「家长」） |
| `ENABLE_CSRF=false` | ✅ | 关闭平台 CSRF，否则接口 403 |
| `AI_SETTING_ENCRYPTION_KEY` | ✅ | AI 密钥静态加密（>= 16 字符） |
| `BODY_SIZE_LIMIT` |  | 请求体上限，图片识别需要（默认 `12mb`） |
| `SERVER_HOST/PORT` |  | 监听地址/端口（默认 `localhost:3000`） |
| `VIEWS_DIR` |  | 页面目录，默认 `<工作目录>/dist/client` |

### 5. 构建

```bash
MIAODA_APP_TYPE=3 npm run build:prod
```

> ⚠️ **必须带 `MIAODA_APP_TYPE=3`**。否则生成的 `dist/client/index.html` 是开发版（引用 `/@vite/client`、`/client/src/main.ts`），生产环境会白屏。

### 6. 启动服务

**方式 A：1Panel Node.js 项目**

在「网站 → 运行环境 / Node.js 项目」中新建：

- 工作目录：`/opt/task_work`（**必须是项目根**，服务端从 `<cwd>/dist/client` 渲染页面）
- 启动命令：`node dist/server/main.js`
- 端口：`3000`
- 环境变量：可直接读 `.env`，或在面板里逐条配置

**方式 B：PM2（推荐，自带开机自启）**

仓库已提供 `ecosystem.config.js`：

```bash
npm i -g pm2
pm2 start ecosystem.config.js      # 使用仓库内置配置（cwd=项目根，自动读 .env）
pm2 save
pm2 startup                        # 按提示执行输出的命令，配置开机自启
pm2 logs task-work                 # 查看日志
```

常用：`pm2 restart task-work`、`pm2 stop task-work`、`pm2 status`。

**方式 C：systemd（不用 PM2 时）**

新建 `/etc/systemd/system/task-work.service`：

```ini
[Unit]
Description=Task Work (NestJS)
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/task_work
ExecStart=/usr/bin/node dist/server/main.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production
# 应用会自动加载工作目录下的 .env；若不用 .env 可在此显式声明：
# Environment=SUDA_DATABASE_URL=postgres://postgres:password@127.0.0.1:5432/task_work
# Environment=FORCE_AUTHN_INNERAPI_DOMAIN=http://127.0.0.1:9
# Environment=STANDALONE_USER_ID=nas
# Environment=ENABLE_CSRF=false
# Environment=AI_SETTING_ENCRYPTION_KEY=请替换

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now task-work
systemctl status task-work
journalctl -u task-work -f
```

> `ExecStart` 里的 `node` 路径用 `which node` 的结果替换。

### 7. 反向代理 / HTTPS

1Panel「网站 → 创建网站 → 反向代理」：域名如 `task.example.com`，代理地址 `http://127.0.0.1:3000`，并开启 HTTPS（Let's Encrypt）。

若要手写 Nginx（1Panel 的 OpenResty）配置，参考：

```nginx
server {
    listen 80;
    server_name task.example.com;

    # ⚠️ 图片识别以 base64 上传，必须放开请求体限制（与 BODY_SIZE_LIMIT 匹配）
    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # AI 识别单次可能 30s+，适度放宽超时
        proxy_connect_timeout 15s;
        proxy_send_timeout    180s;
        proxy_read_timeout    180s;
    }
}
```

> 关键：`client_max_body_size` 必须放开，否则上传照片会在 Nginx 层被 413 拦下（到不了应用）。
> 无需注入任何身份 / CSRF 头（独立部署已在应用层处理）。

### 8. 首次使用

访问域名 → 「孩子管理」添加孩子 → 「任务配置」建必要任务 → 「AI 设置」填接口 → 「作业任务池」AI 导入 / 手动添加。

---

## 升级

```bash
cd /opt/task_work
git pull
npm install --ignore-scripts
MIAODA_APP_TYPE=3 npm run build:prod
pm2 restart task-work     # 或面板里重启
```

---

## 常见问题

| 现象 | 原因 / 解决 |
|---|---|
| `npm install` 报 `fullstack-cli not found` | 加 `--ignore-scripts` |
| 启动报 `平台模式需要基础域名` | 未设 `FORCE_AUTHN_INNERAPI_DOMAIN` |
| 启动报 `Failed to parse connection info` | `SUDA_DATABASE_URL` 为空或格式错误 |
| 接口 403 `csrf token not found` | 未设 `ENABLE_CSRF=false` |
| 页面白屏 / 资源 404 | 构建时没带 `MIAODA_APP_TYPE=3`，重新构建 |
| 数据混乱、反复新建家庭 | 未设 `STANDALONE_USER_ID` |
| 查询报 `role "authenticated_" does not exist` | 建表脚本没执行，或非超级用户执行导致 `CREATE ROLE` 失败 |
| 图片识别 404 / 请求体过大 | 图片地址支持 base（自动补 `/chat/completions`）；`BODY_SIZE_LIMIT` 调大 |
| 端口无法访问 | 用反代时 `SERVER_HOST=127.0.0.1`；直连则设 `0.0.0.0` 并放行端口 |
| Node 版本报错 | 需 Node >= 22 |
