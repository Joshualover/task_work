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
  /**
   * 密码版本（密码哈希尾段指纹）：修改密码后旧会话自动失效。
   * 旧版本会话无此字段，到期前仍然有效（平滑迁移）。
   */
  pv?: string;
}

/** 从密码哈希提取会话校验用的版本指纹（哈希含随机盐，每次改密都会变化） */
export function passwordVersion(passwordHash: string): string {
  return passwordHash.slice(-16);
}

export const SESSION_COOKIE = 'tw_session';
const DEFAULT_SECRET = 'task-work-dev-session-secret-change-me';

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // 安全兜底：非 development 环境拒绝使用开发默认密钥签发/校验会话，
    // 防止源码中的硬编码密钥被用来伪造任意身份的会话令牌。
    if (process.env.NODE_ENV !== 'development') {
      throw new Error(
        'SESSION_SECRET 未设置：非开发环境禁止使用默认密钥。请配置 SESSION_SECRET 后重启。',
      );
    }
    // 仅提示一次，避免刷屏
    if (!getSecret.warned) {
      getSecret.warned = true;
      logger.warn(
        'SESSION_SECRET 未设置，正在使用开发默认密钥。生产环境请务必配置。',
      );
    }
    return DEFAULT_SECRET;
  }
  if (secret.length < 32) {
    logger.warn('SESSION_SECRET 长度不足 32 字符，建议更换为更强的随机密钥。');
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

/**
 * 取当前请求的应用登录态（APP_LOGIN=true 时由 server/main.ts 中间件注入到 req.appUser）。
 * 未开启应用登录（STANDALONE_USER_ID 模式）时返回 null。
 */
export function getAppUser(req: unknown): SessionPayload | null {
  const appUser = (req as { appUser?: SessionPayload } | null)?.appUser;
  return appUser ?? null;
}
