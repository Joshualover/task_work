/**
 * 金额工具：内部统一用「分」存储，展示用「元」。
 */

/** 分 -> 元（去掉多余的 .00） */
export function fenToYuan(fen: number | null | undefined): string {
  const value = (fen ?? 0) / 100;
  return value.toFixed(2).replace(/\.?0+$/, '');
}

/** 元 -> 分 */
export function yuanToFen(yuan: string | number): number {
  const n = Number(yuan);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}
