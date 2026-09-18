import { createHmac, timingSafeEqual } from 'node:crypto';
import { Logger } from '@nestjs/common';

const logger = new Logger('Session');

/**
 * 轻量会话令牌：`base64url(payload).base64url(HMAC-SHA256)`。
 * 无需引入 JWT 依赖；密钥来自 SESSION_SECRET（未设置时用开发默认值并告警）。
 */
export interface SessionPayload {
  /** 应用用户 id */
  uid: string;
  /** parent | child */
  role: 'parent' | 'child';
  familyId: string;
  childId: string | null;
  /** 家庭归属用户 id（用于复用平台的 family 归属逻辑） */
  ownerId: string;
  displayName: string;
  exp: number;
}

export const SESSION_COOKIE = 'tw_session';
const DEFAULT_SECRET = 'task-work-dev-session-secret-change-me';

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // 仅提示一次，避免刷屏
    if (!getSecret.warned) {
      getSecret.warned = true;
      logger.warn(
        'SESSION_SECRET 未设置，正在使用开发默认密钥。生产环境请务必配置。',
      );
    }
    return DEFAULT_SECRET;
  }
  return secret;
}
getSecret.warned = false;

export function signSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', getSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySession(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const idx = token.lastIndexOf('.');
  if (idx <= 0) return null;
  const body = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = createHmac('sha256', getSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as SessionPayload;
    if (!payload?.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
