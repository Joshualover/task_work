/**
 * postinstall：执行平台的 action-plugin 初始化。
 *
 * 为什么要包一层：
 * `fullstack-cli` 是平台环境预装的全局命令，不在 package.json 依赖里
 * （全库扫过，node_modules 中没有任何包提供该 bin）。本地 `npm ci` 时
 * postinstall 必然失败并**中止整个安装**，导致其后的 `prepare` 不执行，
 * `git config core.hooksPath .githooks` 也就永远不会被设置——pre-commit
 * 门禁在新克隆的仓库上是静默失效的。
 *
 * 策略（只容忍「命令不存在」，不容忍「命令执行失败」）：
 *   - 命令不存在（ENOENT / exit 127）：本地开发的正常情况 → 警告后放行，
 *     让后续的 prepare 能跑起来。
 *   - 命令存在但返回非 0：这是平台侧真实故障 → 原样透传退出码，安装失败。
 */
import { spawnSync } from 'node:child_process';

const CLI = 'fullstack-cli';
const ARGS = ['action-plugin', 'init'];

const result = spawnSync(CLI, ARGS, {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

// spawnSync 在 shell 模式下用 127 表示「命令未找到」
const notFound =
  result.error?.code === 'ENOENT' || result.status === 127 || result.status === null;

if (notFound) {
  console.warn(
    `\n[postinstall] 未找到 ${CLI}，跳过 \`${CLI} ${ARGS.join(' ')}\`。\n` +
      '  该命令由平台环境预装；本地开发不安装不影响运行与测试。\n' +
      '  已放行以便后续 prepare 生效（设置 core.hooksPath）。\n',
  );
  process.exit(0);
}

if (result.status !== 0) {
  console.error(`\n[postinstall] \`${CLI} ${ARGS.join(' ')}\` 执行失败（退出码 ${result.status}）。\n`);
  process.exit(result.status ?? 1);
}
