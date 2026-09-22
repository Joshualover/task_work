/**
 * 静态检查：Vue 模板中调用的函数是否在 <script> 中存在。
 *
 * 为什么需要它：模板里调用一个脚本中不存在的函数，只在运行时抛错，
 * 会导致 Vue 中断渲染补丁 —— 页面表现为「一直卡在加载中」，
 * 而 type-check / eslint / build 全都是通过的。这个脚本用于兜住这类问题。
 *
 * 用法：
 *   node scripts/check-template-bindings.mjs            # 扫描 client/src 下所有 .vue
 *   node scripts/check-template-bindings.mjs a.vue b.vue # 只检查指定文件
 */
import fs from 'node:fs';
import path from 'node:path';

const IGNORE = new Set([
  // JS 内置 / 全局
  'Object', 'Array', 'String', 'Number', 'Boolean', 'JSON', 'Math', 'Date',
  'parseInt', 'parseFloat', 'isNaN', 'encodeURIComponent', 'decodeURIComponent',
  'Promise', 'Set', 'Map',
  // CSS 函数（出现在 :style / class 字符串里）
  'env', 'var', 'calc', 'url', 'rgb', 'rgba', 'hsl', 'hsla', 'gradient',
  'linear-gradient', 'radial-gradient', 'repeat', 'minmax', 'cubic-bezier',
  'translate', 'translateX', 'translateY', 'scale', 'rotate', 'blur',
  'min', 'max', 'clamp', 'attr', 'counter', 'format',
]);

/** 不需要闭合的标签 */
const VOID_TAGS = new Set([
  'br', 'hr', 'img', 'input', 'meta', 'link', 'source',
  'area', 'base', 'col', 'embed', 'track', 'wbr',
]);

/**
 * 模板标签配对检查：揪出「少了结束标签」这类只在构建时才报错的问题。
 * （type-check / eslint 都不解析模板，vite build 才会报）
 */
function checkTagBalance(src) {
  // 贪心匹配 = 取最外层 <template>
  const root = src.match(/<template[^>]*>([\s\S]*)<\/template>/);
  if (!root) return [];
  const body = root[1]
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '');

  const stack = [];
  const tagRe = /<\/?([A-Za-z][\w.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let m;
  while ((m = tagRe.exec(body)) !== null) {
    const raw = m[0];
    const name = m[1];
    const selfClose = m[3] === '/' || raw.endsWith('/>');
    if (VOID_TAGS.has(name.toLowerCase()) || selfClose) continue;
    if (raw.startsWith('</')) {
      const top = stack.pop();
      if (top !== name) return [`标签不匹配：期望 </${top}>，实际 </${name}>`];
    } else {
      stack.push(name);
    }
  }
  return stack.length > 0 ? [`未闭合标签：<${stack.join('>、<')}>`] : [];
}

/** 递归收集目录下的 .vue 文件 */
function collectVueFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      collectVueFiles(full, acc);
    } else if (entry.name.endsWith('.vue')) {
      acc.push(full);
    }
  }
  return acc;
}

const args = process.argv.slice(2);
const files = args.length > 0 ? args : collectVueFiles('client/src').sort();

let failed = 0;
let checked = 0;

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');

  const tplMatch = src.match(/<template>[\s\S]*<\/template>/);
  const scriptMatch = src.match(/<script[^>]*>[\s\S]*?<\/script>/);
  if (!tplMatch || !scriptMatch) {
    console.log(`-  ${file}（无 template/script 块，跳过）`);
    continue;
  }  const tpl = tplMatch[0];
  const script = scriptMatch[0];

  // 只取「非成员访问」的调用（排除 x.trim() 这类方法调用）
  const calls = new Set(
    [...tpl.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]),
  );

  const missing = [];
  for (const name of calls) {
    if (IGNORE.has(name)) continue;
    if (name[0] === name[0].toUpperCase()) continue; // 组件 / 构造器
    if (!new RegExp(`\\b${name}\\b`).test(script)) missing.push(name);
  }

  if (missing.length > 0) {
    failed += 1;
    console.log(`❌ ${file}\n   模板调用但脚本中不存在: ${missing.join(', ')}`);
    continue;
  }

  const tagErrors = checkTagBalance(src);
  if (tagErrors.length > 0) {
    failed += 1;
    console.log(`❌ ${file}\n   ${tagErrors.join('；')}`);
    continue;
  }

  checked += 1;
}

if (failed > 0) {
  console.log(`\n共 ${failed} 个文件存在问题`);
  process.exit(1);
}
console.log(`\n✅ 已检查 ${checked} 个 .vue 文件，模板绑定与标签配对均正常`);
