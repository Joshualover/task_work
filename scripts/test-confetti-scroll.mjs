/**
 * 撒花特效 + 滚动保持 的冒烟测试。
 * 用极简 DOM 桩在 Node 里直跑 client/src/utils 下的真实实现（Node 自带 TS 类型剥离）。
 * 用法：node scripts/test-confetti-scroll.mjs
 */
import { setTimeout as delay } from 'node:timers/promises';

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass += 1; console.log(`   ✅ ${msg}`); }
  else { fail += 1; console.log(`   ❌ ${msg}`); }
};

// ---------- 极简 DOM 桩 ----------
class FakeEl {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.style = { cssText: '' };
    this.childNodes = [];
    this.attrs = {};
    this.isConnected = false;
    this.parentNode = null;
    this.scrollTop = 0;
    this.scrollLeft = 0;
    this.animations = [];
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  appendChild(child) {
    child.parentNode = this;
    child.isConnected = true;
    this.childNodes.push(child);
    return child;
  }
  remove() {
    this.isConnected = false;
    if (this.parentNode) {
      const i = this.parentNode.childNodes.indexOf(this);
      if (i >= 0) this.parentNode.childNodes.splice(i, 1);
    }
  }
  animate(frames, options) {
    this.animations.push({ frames, options });
    return { finished: Promise.resolve(), cancel() {} };
  }
}

const body = new FakeEl('body');
const mainEl = new FakeEl('main');
mainEl.scrollTop = 420;
const rootEl = new FakeEl('html');
// <main> 是真实存在的节点（否则 snapshotScroll 会跳过已卸载的节点）
body.appendChild(mainEl);
body.appendChild(rootEl);

let reducedMotion = false;

globalThis.Element = FakeEl;
globalThis.document = {
  body,
  scrollingElement: rootEl,
  createElement: (tag) => new FakeEl(tag),
  querySelectorAll: () => [mainEl],
};
globalThis.window = {
  innerWidth: 390,
  innerHeight: 844,
  matchMedia: () => ({ matches: reducedMotion }),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
};

const { burstConfetti } = await import('../client/src/utils/confetti.ts');
const { snapshotScroll } = await import('../client/src/utils/scroll.ts');

// ---------- 撒花特效 ----------
console.log('\n【撒花特效】');
{
  const before = body.childNodes.length;
  burstConfetti({ count: 12, duration: 80 });
  const layer = body.childNodes[body.childNodes.length - 1];
  ok(body.childNodes.length === before + 1, '特效层已挂到 body');
  ok(layer?.childNodes.length === 12, `生成 12 个碎片（实际 ${layer?.childNodes.length}）`);
  ok(
    layer?.childNodes.every((p) => p.animations.length === 1),
    '每个碎片都启动了动画',
  );
  const sample = layer?.childNodes[0];
  ok(
    typeof sample?.style.cssText === 'string' && sample.style.cssText.includes('position:absolute'),
    '碎片使用绝对定位',
  );
  ok(
    sample?.animations[0].options.easing?.includes('cubic-bezier'),
    '动画使用缓动曲线',
  );
  ok(layer?.attrs['aria-hidden'] === 'true', '特效层对读屏隐藏（aria-hidden）');
  await delay(1100);
  ok(!layer.isConnected && body.childNodes.length === before, '动画结束自动清理 DOM，无残留');
}

console.log('\n【尊重「减少动态效果」】');
{
  reducedMotion = true;
  const before = body.childNodes.length;
  burstConfetti({ count: 12, duration: 50 });
  ok(body.childNodes.length === before, 'prefers-reduced-motion 下不播放特效');
  reducedMotion = false;
}

console.log('\n【不支持 WAAPI 时静默跳过】');
{
  const origin = FakeEl.prototype.animate;
  delete FakeEl.prototype.animate;
  const before = body.childNodes.length;
  burstConfetti({ count: 12, duration: 50 });
  ok(body.childNodes.length === before, '无 Element.animate 时不报错、不插节点');
  FakeEl.prototype.animate = origin;
}

// ---------- 滚动保持 ----------
console.log('\n【滚动位置保持（<main> 内部滚动）】');
{
  mainEl.scrollTop = 420;
  const restore = snapshotScroll();
  // 模拟刷新时内容高度骤降，浏览器把 scrollTop 夹到 0（也就是「跳回顶部」）
  mainEl.scrollTop = 0;
  restore();
  ok(mainEl.scrollTop === 420, `恢复 <main> 滚动位置到 420（实际 ${mainEl.scrollTop}）`);
}
{
  // 未滚动时不记录，避免无意义写入
  mainEl.scrollTop = 0;
  rootEl.scrollTop = 0;
  const restore = snapshotScroll();
  mainEl.scrollTop = 123;
  restore();
  ok(mainEl.scrollTop === 123, '原本在顶部时不会被强行改回');
}
{
  // 节点已卸载（切页）时安全跳过
  mainEl.scrollTop = 300;
  const restore = snapshotScroll();
  mainEl.isConnected = false;
  let threw = false;
  try {
    restore();
  } catch {
    threw = true;
  }
  ok(!threw, '滚动容器已卸载时不抛异常');
  mainEl.isConnected = true;
}

console.log(`\n通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail > 0 ? 1 : 0);
