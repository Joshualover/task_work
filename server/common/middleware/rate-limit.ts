import type { Request, Response, NextFunction } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  /** 统计窗口（毫秒） */
  windowMs: number;
  /** 窗口内允许的最大请求数 */
  max: number;
  /** 超限提示文案 */
  message?: string;
}

/**
 * 轻量内存限流中间件（按 IP）。
 * 本应用为单实例家庭应用，内存桶即足够；多实例部署需换 Redis 实现。
 */
export function createRateLimiter(options: RateLimitOptions) {
  const hits = new Map<string, Bucket>();

  // 定期清理过期桶，防止内存无限增长
  const cleaner = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of hits) {
      if (bucket.resetAt <= now) {
        hits.delete(key);
      }
    }
  }, Math.max(options.windowMs, 60_000));
  // 不阻止进程退出
  cleaner.unref();

  return function rateLimit(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    const now = Date.now();

    let bucket = hits.get(ip);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      hits.set(ip, bucket);
    }
    bucket.count += 1;

    if (bucket.count > options.max) {
      const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: {
          code: 'TOO_MANY_REQUESTS',
          message:
            options.message ?? '请求过于频繁，请稍后再试',
          timestamp: Date.now(),
        },
      });
      return;
    }

    next();
  };
}
