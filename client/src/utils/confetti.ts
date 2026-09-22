/**
 * 轻量撒花特效（无第三方依赖，基于 Web Animations API）。
 *
 * 用途：孩子完成任务后给一点正反馈。
 * 特点：动画结束自动移除 DOM（不会残留节点）；遵守系统「减少动态效果」偏好；
 * 不支持 WAAPI 的环境（老浏览器 / SSR）直接静默跳过。
 */

const COLORS = [
  '#FF8A3D',
  '#FFB347',
  '#FFD666',
  '#36BFFA',
  '#52C41A',
  '#FF7BAC',
  '#9B7BFF',
];

export interface ConfettiOptions {
  /** 碎片数量，默认 90 */
  count?: number;
  /** 基础时长（毫秒），默认 2200 */
  duration?: number;
}

export function burstConfetti(options: ConfettiOptions = {}): void {
  if (typeof document === 'undefined') return;
  // 尊重系统「减少动态效果」设置
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  if (typeof Element.prototype.animate !== 'function') return;

  const count = options.count ?? 90;
  const duration = options.duration ?? 2200;
  const viewportWidth = window.innerWidth || 360;
  const viewportHeight = window.innerHeight || 640;

  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'width:100%',
    'height:100%',
    'overflow:hidden',
    'pointer-events:none',
    'z-index:9999',
  ].join(';');

  for (let i = 0; i < count; i += 1) {
    const piece = document.createElement('span');
    const size = 6 + Math.random() * 8;
    const isRound = Math.random() < 0.35;
    piece.style.cssText = [
      'position:absolute',
      `left:${Math.round(Math.random() * viewportWidth)}px`,
      'top:-24px',
      `width:${size.toFixed(1)}px`,
      `height:${(isRound ? size : size * 1.6).toFixed(1)}px`,
      `background:${COLORS[i % COLORS.length]}`,
      `border-radius:${isRound ? '50%' : '2px'}`,
      'opacity:0.95',
      'will-change:transform,opacity',
    ].join(';');
    layer.appendChild(piece);

    const drift = (Math.random() - 0.5) * 220;
    const fall = viewportHeight + 80;
    const spin = (Math.random() - 0.5) * 1080;
    piece.animate(
      [
        { transform: 'translate3d(0, 0, 0) rotate(0deg)', opacity: 1 },
        {
          transform: `translate3d(${drift.toFixed(1)}px, ${fall}px, 0) rotate(${spin.toFixed(0)}deg)`,
          opacity: 0.85,
        },
      ],
      {
        duration: Math.round(duration * (0.75 + Math.random() * 0.5)),
        delay: Math.round(Math.random() * 350),
        easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
        fill: 'forwards',
      },
    );
  }

  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), duration + 900);
}
