# 代码审查报告：小学生任务积分工作台

> 审查日期：2026-09-29 ｜ 范围：client（67 文件）、server（61 文件含 10 个 SQL 迁移）、根配置
> 严重程度：🔴 高（须尽快修复）｜ 🟡 中（近期修复）｜ 🟢 低（择机优化）
>
> **✅ 修复进度（2026-09-29 晚，第三批完成）**：H1-H7 全部修复 ✅；
> 已修复中危：M1（DTO 全面校验 + 全局 whitelist/forbidUnknownValues）、M2（登录/注册/建账号/改密限流，自研内存限流器）、M3（改密吊销旧会话，密码版本指纹）、M4、M7、M8、M9、M10、M11、M12、M13、M14、M17。
> 已修复低危：L5（余额 CHECK 约束 + 6 个缺失索引，迁移 `2026-09-29_add_balance_checks_and_indexes.sql`，已登记 DEPLOY.md）。
> 剩余：L1-L4、L6-L12 等低危项（TasksPage 拆分、composables 收敛、图床本地化等）可择机处理。
> 所有修改已通过 `type:check`（前后端）与 ESLint。

## 总体评价

- ✅ **做得好的**：无 XSS 注入面（无 v-html/innerHTML/eval）、token 不落 localStorage、scrypt 密码哈希、SSRF 防护、条件 UPDATE 防并发重复提交、FK 完整、路由懒加载、ECharts 按需引入、shared 类型复用。
- ⚠️ **主要风险集中在**：鉴权信任链（客户端可伪造身份头）、会话密钥默认值、IDOR 一处、积分并发丢失更新、前端请求竞态、巨型组件。

---

## 一、🔴 高严重度

### H1. 客户端可伪造平台身份头，接管任意家庭
- **位置**：`server/main.ts:32`、`server/main.ts:92`
- **影响**：独立部署（NAS）下无网关签名，攻击者自带 `x-larkgw-suda-webuser` 头即可冒充任意 user_id，接管任意家庭全部数据。应用登录模式下，已登录的**孩子**也可预置该头（`if (!req.headers[...])` 不会覆盖），把 `userContext.userId` 指向任意用户，绕过家庭隔离。
- **建议**：应用登录模式改为**无条件用 session 覆写**该头（去掉 `if (!...)` 判断）；独立部署模式强制要求设置 `STANDALONE_USER_ID` 且拒绝/告警外部传入的该头，或加网关共享密钥签名校验。

### H2. SESSION_SECRET 缺省时静默使用硬编码密钥
- **位置**：`server/common/utils/session.ts:24,36`
- **影响**：生产漏配环境变量时，任何人可用公开的默认密钥 `'task-work-dev-session-secret-change-me'` 签发 `{role:'parent'}` 合法会话，完全绕过登录。
- **建议**：`NODE_ENV=production` 且未配置 `SESSION_SECRET` 时直接 `abortOnError` 拒绝启动（当前 `main.ts:22` 已有 abortOnError 机制，可复用）。同时校验密钥长度 ≥32 字符。

### H3. 零花钱审批接口缺失家庭归属校验（IDOR）
- **位置**：`server/modules/allowance/allowance.controller.ts:189-216`（`reviewRequest`）
- **影响**：任意登录用户可按 requestId 审批**他人家庭**的零花钱申请，触发真实扣款与流水写入。对比 `redemption.controller.ts:142-143` 的兑换审批有校验，此处遗漏。
- **建议**：审批前 join `allowance_request → child → family` 校验 `family.id === 当前用户 familyId`；建议对所有 `:id` 型接口做一次同类排查。

### H4. 积分发放为"读-改-写"，并发丢失更新
- **位置**：`server/modules/task/task.service.ts:868-875`（`reviewTask`）
- **影响**：同一孩子两个任务并发审核时读到同一余额，后写覆盖前写 → **积分丢失**，且 `balanceAfter` 流水与真实余额永久漂移。正确写法已在 `point.service.ts:125-129` 存在（原子自增）。
- **建议**：改为 `update(child).set({ points: sql\`${child.points} + ${amount}\` })`，流水 `balanceAfter` 用 `RETURNING points` 取真实值。

### H5. 头像 URL 被当作文本渲染
- **位置**：`client/src/components/Layout.vue:690-693`、`client/src/pages/child-manage/ChildManagePage.vue:133`
- **影响**：家长填写头像 URL 后，头部选择器和孩子卡片显示整串 URL 文字而非图片。
- **建议**：参照 `ChildDashboardPage.vue:37-43` 的 `<img :src>` 写法修复两处。

### H6. 图片上传双数组可错位，发给 AI 的图片错乱
- **位置**：`client/src/pages/tasks/TasksPage.vue:778-802`（`processImageFiles`）
- **影响**：先 push 文件再异步压缩，压缩失败时两个数组长度不一致，`removeImage(index)` 删错位，base64 错发给 AI 识别。
- **建议**：改为单一对象数组 `{ file, preview }`，原子操作；压缩失败时移除对应元素。

### H7. 子任务乐观更新错误回滚
- **位置**：`client/src/pages/child-dashboard/ChildDashboardPage.vue:917-939`
- **影响**：toggle 成功后 `loadTasks(true)` 失败也走 catch，把**已成功**的勾选回滚，UI 与服务端状态相反。
- **建议**：仅对 `toggleSubtask` 本身 try/catch 回滚，`loadTasks` 失败单独 toast 处理。

---

## 二、🟡 中严重度

### 安全类
| # | 问题 | 位置 | 建议 |
|---|------|------|------|
| M1 | 全局 ValidationPipe 无 `whitelist`，7 个 controller 的 DTO 是空壳类无校验，AI 模块直接用 interface 当 body | `app.module.ts`（SDK 内）、`auth/allowance/point/reward/redemption.controller.ts` | 所有 DTO 补 class-validator 装饰器；ValidationPipe 加 `whitelist: true, forbidNonWhitelisted: true` |
| M2 | 登录/注册/邀请码无速率限制；邀请码用 `Math.random` 生成 | `auth.controller.ts:77-99`、`auth.service.ts:58-65` | 接口限流（如 express-rate-limit）；邀请码改 `crypto.randomInt` |
| M3 | 会话不可吊销，改密后旧 token 仍有效 7 天 | `auth.service.ts:94-115`、`session.ts` | payload 加 `pwdVersion`，改密时版本号 +1 |
| M4 | 异常过滤器把 `stack`/`cause` 返回给客户端 | `server/common/filters/exception.filter.ts:69-70` | stack 仅日志输出，响应只返回 traceId |
| M5 | AI 密钥加密键缺失时明文入库；密文可超 `varchar(200)` | `crypto.ts:41-44`、`schema.ts:224` | 缺键时拒绝保存；`api_key` 改 `text` |
| M6 | 孩子账号不带 childId 的请求可见全家（含兄弟姐妹）兑换/零花钱数据 | `main.ts:119-132`、`redemption.service.ts:44-54` | 孩子会话强制注入 `childId` 过滤 |

### Bug 类
| # | 问题 | 位置 |
|---|------|------|
| M7 | `today` computed 无响应式依赖，跨午夜不刷新；`watch([..., today])` 中 today 永不触发 | `TasksPage.vue:170,251`、`ChildDashboardPage.vue:583`、`ParentDashboardPage.vue:223` |
| M8 | 请求竞态无守卫：快速切孩子/翻页时旧响应覆盖新数据（5 个页面） | `TasksPage.vue:220`、`PointsPage.vue:46`、`AllowancePage.vue:439`、`TaskHistoryPage.vue:275`、`RedemptionPage.vue:191` |
| M9 | 家长端"提交完成"按钮无防抖可连点；子任务勾选依赖 `suggestionId` 无则静默失败 | `TasksPage.vue:1055,311` |
| M10 | 多页面操作失败只 console 不 toast，用户无感知 | `ChildDashboardPage.vue:967`、`RewardsPage.vue:222,231`、`PointsPage.vue:97`、`RedemptionPage.vue:217,242`、`TaskTemplatesPage.vue:487,515` |
| M11 | 通知"标记已读"失败仍执行乐观更新，未读数永久偏小 | `Layout.vue:560-569` |
| M12 | `addGoalProgress` 读改写并发丢进度，超额进度被静默吞掉 | `task.service.ts:587-606` |
| M13 | 兑换限额检查在事务外（TOCTOU），并发可突破每日/每周限额 | `redemption.service.ts:150-237` |
| M14 | 分页参数 `parseInt('abc')` → NaN → `LIMIT NaN` 500 | `point.controller.ts:59`、`allowance.controller.ts:80` |
| M15 | 已完结任务可改积分/日期，不重算已发流水，账实不符 | `task.service.ts:480-523` |
| M16 | 读路径（listTasks）内做两次无事务 UPDATE 标记逾期 | `task.service.ts:289-293,940-974` |

### 性能类
| # | 问题 | 位置 |
|---|------|------|
| M17 | 通知轮询不感知页面可见性，后台标签页仍每 30s 请求 | `Layout.vue:614-616` |
| M18 | 复用页面 `mode` 与 `childId` 双 watch 重复触发请求；onMounted+watch 首帧并发两次 | `RewardsPage.vue:118-127`、`AllowancePage.vue:560`、`TaskHistoryPage.vue:317` |
| M19 | getUsage 对每个奖励循环查询（N+1） | `reward.service.ts:272-305` |
| M20 | listTasks 无分页（total 算了但不用）；批量接口逐条 getTask（N+1） | `task.service.ts:286-383`、`task.controller.ts:341-350` |

---

## 三、🟢 低严重度

| # | 问题 | 位置 |
|---|------|------|
| L1 | cookie 非 secure、CSRF 可被 env 关闭 | `auth.controller.ts:60`、`app.module.ts:26-29` |
| L2 | `task.controller.ts:494,504` 两个接口缺 `@NeedLogin()`（防御纵深） | task.controller.ts |
| L3 | base64 data URL 直传 AI 且原样入库 `ai_recognition_log`（单条可达数 MB 无清理） | `TasksPage.vue:681`、`ai.service.ts:762,807` |
| L4 | 硬编码第三方图床 URL（百度/搜狗盗链，随时 403） | `utils/subject-image.ts:6-14` |
| L5 | 余额列无 `CHECK (>=0)`；status/type 列无约束；`point_transaction.related_id` 缺索引；建议补复合索引 `(child_id, created_at)` | `schema.ts:328,342,451` |
| L6 | `homework_subtask.points` 默认 5 与业务写 0 矛盾；`_updated_at` 多处不更新 | `schema.ts:124` |
| L7 | 两个迁移缺事务包裹；`local-dev-bootstrap.sql` 含 SUPERUSER 角色（勿用于生产） | `server/database/migrations/` |
| L8 | TasksPage.vue 2377 行，五段任务卡片模板 95% 重复（最大可维护性债务） | `TasksPage.vue:898-1745` |
| L9 | `STATUS_*` 映射重复 4 份、`formatDate` 重复 5 份且行为不一致、`getAvatarDisplay` 重复 2 份 | 见代理报告 |
| L10 | `ai.service.ts` 1222 行、`task.service.ts` 1017 行巨型 Service；`listTasks/countTasks` 过滤条件整段复制 | server |
| L11 | `error: any` 滥用 2 处、React 类型残留、`index.vue.html` 残留文件、hello 模块死代码 | 各处 |
| L12 | 未清理的 setTimeout、ConfirmDialog 双源状态、目录命名不一致（NotFound PascalCase） | 各处 |

---

## 四、改进建议（按执行顺序）

### 第一批：安全止血（半天）
1. `main.ts:92` 去掉 `if (!req.headers[...])`，无条件用 session 覆写身份头；独立部署拒绝外部传入该头。
2. `session.ts`：production 未配 `SESSION_SECRET` → 抛错拒绝启动。
3. `allowance.controller.ts reviewRequest` 补家庭归属校验。
4. `task.service.ts:868-875` 改原子自增 + `RETURNING`。
5. 异常过滤器移除 `stack` 输出。

### 第二批：正确性（1-2 天）
6. 修复前端 5 个页面的请求竞态（AbortController 或请求序号守卫）——建议抽 `useAsyncList()` composable 一并解决。
7. 修复 H5/H6/H7 三个前端逻辑错误（头像渲染、图片数组、乐观回滚）。
8. DTO 全面补 class-validator + `whitelist: true`；分页参数 NaN 防御。
9. `today`/`now` 改为每分钟刷新的响应式时间源。
10. 兑换限额检查移入事务（`SELECT ... FOR UPDATE` 或唯一约束兜底）。

### 第三批：可维护性（持续重构）
11. 拆分 TasksPage：抽 `TaskCard.vue`（props + 按钮插槽），文件缩至 1/3。
12. 建立 `composables/`（useAsyncList/usePaged/usePolling），收敛 4 份状态映射、5 份 formatDate 到 `utils/`。
13. 拆分 task.service / ai.service 为领域子服务；统一 DTO 风格。
14. 数据库：加余额 CHECK 约束、`related_id` 与复合索引、status 枚举校验。
15. 通知轮询加 `visibilitychange` 暂停；复用页面双 watch 合并为单一 watchSource。
