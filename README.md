# 小学生任务积分工作台

面向家庭场景的儿童自我管理与激励工具。家长配置每日必要任务与积分规则，孩子完成任务后获得积分，用积分兑换家长设定的奖励。

- **家长（管理员）**：配置任务、设置积分规则、维护奖励库、审核任务完成、审核兑换申请、查看报表
- **孩子（使用者）**：查看当日任务、提交完成打卡、查看积分与流水、提交兑换申请

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 + TypeScript + Vue Router 4 + Pinia + Tailwind CSS + lucide-vue-next |
| 后端 | NestJS 10 + TypeScript + Drizzle ORM + PostgreSQL |
| 构建 | Vite（React preset + 注入 Vue 插件）、SWC |

## 目录结构

```
client/                 前端（全部为 .vue）
  index.html            入口 HTML（script 指向 /client/src/main.ts）
  src/
    main.ts             应用入口
    App.vue / router/   Vue Router 路由
    pages/              页面（家长端 + 孩子端）
    components/ui/      自研 Vue 组件（Button/Dialog/Input/...）
    api/                后端接口封装
    stores/             Pinia store（当前孩子等）
    utils/date.ts       统一日期工具（Asia/Shanghai）
server/                 NestJS 后端
  main.ts               启动入口
  modules/              业务模块（family/child/task/point/reward/redemption/ai/report）
  database/schema.ts    数据库 schema（由平台 gen:db-schema 生成）
  database/migrations/  迁移与本地开发初始化 SQL
  common/utils/         日期、加密、PG 错误等工具
shared/api.interface.ts 前后端共享类型
scripts/dev-local.sh    本地一键启动脚本（DB + 建表 + 前后端）
```

---

## 运行方式

本项目是**妙搭平台（Miaoda）fullstack 应用**，完整运行依赖平台注入的环境变量（数据库、鉴权域名、用户上下文）。两种运行方式：

### 方式一：平台沙箱（推荐，生产/完整功能）

在妙搭沙箱/IDE 内执行：

```bash
npm run dev
```

平台会通过 `lark-cli apps +env-pull` 注入 `SUDA_DATABASE_URL`、`FORCE_AUTHN_INNERAPI_DOMAIN`、`SUDA_WEBUSER` 等，并代理 CSRF 与用户身份。

### 方式二：本地自建（无平台账号时）

本地缺少平台注入的数据库与鉴权，需要自行补齐。推荐用一键脚本。

#### 一键启动（推荐）

```bash
bash scripts/dev-local.sh start    # 启动 DB + 建表 + 后端 + 前端
bash scripts/dev-local.sh status   # 查看状态
bash scripts/dev-local.sh stop     # 停止（应用 + 本脚本启动的 PG）
```

脚本会自动完成：

1. 端口 `5432` 若无 PostgreSQL，则用 `embedded-postgres` 在 `.local-dev/` 起一个便携实例（首次会下载二进制）；
2. 确保数据库存在并执行 `server/database/migrations/local-dev-bootstrap.sql` 建表（幂等）；
3. 带上所需环境变量启动 `npm run dev:server` 与 `npm run dev:client`。

启动后访问 **http://localhost:8080/**，日志在 `logs/{pg,dev-server,dev-client}.log`。

可覆盖的配置（环境变量）：`LOCAL_DEV_DIR`、`LOCAL_PG_PORT/USER/PASSWORD/DATABASE`、`SERVER_PORT`、`CLIENT_DEV_PORT`、`AI_SETTING_ENCRYPTION_KEY`、`SUDA_WEBUSER`。

> ⚠️ 必须走 **8080**（Vite），不要直接开 3000。直连后端会因缺少 CSRF/用户上下文被 403 拦截；Vite 的 devProxy 会模拟沙箱网关注入 `x-larkgw-suda-webuser` 与 `x-suda-csrf-token`，同时把 HTML 请求反代给 Nest 渲染。
>
> ⚠️ 运行期间不要删除 `dist/`：后端渲染首页需要 `dist/client/index.html`（由 Vite 启动时生成）。

#### 手动步骤（脚本内部做的事）

<details>
<summary>展开查看</summary>

**1. 准备 PostgreSQL**：任意 PostgreSQL 13+。无本地实例时可用 `embedded-postgres`：

```bash
mkdir -p .local-dev/pg && cd .local-dev/pg
npm init -y && npm i embedded-postgres pg
```

由脚本生成并运行 `pg-start.js`（`databaseDir` 指向 `.local-dev/pgdata`，`user=u / password=p / port=5432`）。

**2. 建表**（创建 11 张表、`user_profile`/`file_attachment` 复合类型，及平台角色 `anon_`/`authenticated_`/`service_role_`）：

```bash
psql "postgres://u:p@127.0.0.1:5432/db" -f server/database/migrations/local-dev-bootstrap.sql
```

**3. 启动后端**：

```bash
export SUDA_WEBUSER='{"user_id":"local-dev-user","app_id":"local","user_name":{"zh_cn":"本地用户"},"is_system_account":false}'
FORCE_AUTHN_INNERAPI_DOMAIN="http://127.0.0.1:9" \
SUDA_DATABASE_URL="postgres://u:p@127.0.0.1:5432/db" \
MIAODA_APP_TYPE=3 \
AI_SETTING_ENCRYPTION_KEY="local-dev-encryption-key-32chars!!" \
npm run dev:server
```

**4. 启动前端**（另开终端）：

```bash
MIAODA_APP_TYPE=3 MIAODA_LOCAL_DEV=1 npm run dev:client
```

**5. 停止**：`bash scripts/dev-local.sh stop`，或按端口找 PID 后 `taskkill /F /PID <pid>`。

</details>

---

## 环境变量

> 首次使用请复制 `.env.example` 为 `.env`（或 `.env.local`）并按需修改；`.env` 已被 git 忽略，不会提交。

| 变量 | 说明 | 本地开发 |
|---|---|---|
| `SUDA_DATABASE_URL` | PostgreSQL 连接串（平台注入） | `postgres://u:p@127.0.0.1:5432/db` |
| `FORCE_AUTHN_INNERAPI_DOMAIN` | 平台鉴权内部接口域名（平台注入） | 占位值即可，业务链路不使用 |
| `SUDA_WEBUSER` | URL 编码的 JSON 用户上下文，devProxy 注入为身份头 | `{"user_id":"local-dev-user",...}` |
| `MIAODA_APP_TYPE` | `3` = fullstack 形态（启用 devProxy/HTML 反代） | `3` |
| `MIAODA_LOCAL_DEV` | `1` 时 devProxy 注入 CSRF/身份（本地开发必开） | `1` |
| `AI_SETTING_ENCRYPTION_KEY` | AI 密钥静态加密密钥（≥16 字符）。留空则明文存储 | 建议设置 |
| `BODY_SIZE_LIMIT` | 请求体大小上限（图片识别 base64 需要） | 默认 `12mb` |
| `CLIENT_BASE_PATH` | 应用路径前缀 | 默认 `/` |
| `SERVER_PORT` / `CLIENT_DEV_PORT` | 后端 / 前端端口 | `3000` / `8080` |

---

## AI 识别接口

支持两种上游格式，按 **API 地址是否以 `/chat/completions` 结尾**自动识别：

1. **OpenAI 兼容**（如 `https://api.xxx.cn/v1/chat/completions`）
   - 请求：`{ model, temperature: 0, messages: [{role:'system',...},{role:'user',...}] }`
   - 响应：解析 `choices[0].message.content` 中的 JSON
   - 图片识别：使用 vision 格式 `content: [{type:'text'}, {type:'image_url'}]`
2. **自定义契约**
   - 请求：`{ content, model }`（图片为 `{ imageUrls, model }`）
   - 响应：`{ tasks: [{ subject, content, quantity, suggestedPoints }] }`

系统提示词要求模型**只输出 JSON**；解析时兼容裸 JSON、```json 代码块及夹杂说明文字。

> 积分规则：AI 识别结果按 **科目**（语文/数学/英语/科学/其他）合并为一个作业任务，任务名统一为「<科目>作业」（如：数学作业），识别到的具体内容作为子任务列出；**每科作业积分固定且各科一致**（默认 10 分，常量 `SUBJECT_HOMEWORK_POINTS`），与子任务数量无关；**子任务仅是完成检查项，不计积分**。

> 作业任务池：按 **单项任务 / 多项任务**（含子任务）分类筛选。多项任务可展开子任务并逐项勾选（家长端任务池、孩子端首页均可）；**子任务全部勾选完成后，该作业任务自动完成并发放积分**（复用审核发分逻辑，幂等）。

> 地址填写：支持完整端点（`https://host/v1/chat/completions`）或 base 地址（`https://api.deepseek.com`、`https://api.openai.com/v1`），后端会自动补全 `/chat/completions`；其他自定义路径则按自定义契约处理。

> 图片识别：图片接口地址/密钥/模型**留空时自动回退到文字识别配置**；上传前由前端压缩（最大边 1280、JPEG 0.82），避免请求体过大；后端请求体上限由 `BODY_SIZE_LIMIT` 控制（默认 `12mb`，见 `server/main.ts`）。模型已响应但无可解析任务时返回空结果，前端提示“未识别到作业内容”，不报错。

> 演示模式：API 地址中包含 `mock` 时返回内置示例数据，不发真实请求。

安全：仅允许 `http/https` 且拒绝指向本机/内网地址（SSRF 防护）；`apiKey`/`imageApiKey` 使用 AES-256-GCM 加密存储，接口不回传明文（仅返回 `hasApiKey`）。

---

## 常用命令

```bash
bash scripts/dev-local.sh start   # 本地一键启动
bash scripts/dev-local.sh stop    # 本地停止
npm run dev:server      # 仅后端（watch）
npm run dev:client      # 仅前端（vite）
npm run type:check      # 前后端类型检查
npm run eslint          # ESLint（含 .vue）
npm run stylelint       # 样式检查
npm run build:server    # 后端构建
npm run build:client    # 前端构建
npm run build           # 平台完整构建（含路由生成、依赖裁剪）
```

## 数据库变更

- `server/database/schema.ts` 为自动生成文件，请勿手改；平台侧变更后用 `npm run gen:db-schema` 重新同步。
- 应用级迁移放在 `server/database/migrations/`，需在部署代码**之前**执行：
  - `2026-09-18_add_constraints_and_suggestion_link.sql`：家庭唯一约束、每日任务唯一索引、`task_instance.suggestion_id` 关联列（**生产必需**）。
  - `local-dev-bootstrap.sql`：本地开发用建表脚本（**仅本地**）。

## 设计规范

- 主色 `#FF8A3D`，辅色 `#36BFFA` / `#52C41A`，背景 `#FFF7E6`
- 卡片 `rounded-2xl`，按钮 `rounded-full`，阴影 `shadow-md hover:shadow-lg`
- 家长端：左侧边栏 + 稳重简洁；孩子端：底部 Tab + 活泼多彩
- 页面内边距 `p-6`，卡片内边距 `p-4`，元素间距 `gap-4`
