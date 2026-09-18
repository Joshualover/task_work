import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';

/**
 * AI 设置中密钥字段的静态加密。
 *
 * - 使用 AES-256-GCM；密钥由环境变量 `AI_SETTING_ENCRYPTION_KEY`（>= 16 字符）经 scrypt 派生。
 * - 密文格式：`enc:v1:<iv>:<tag>:<ciphertext>`（base64）。
 * - 未配置密钥时退化为明文存储（保持向后兼容），并在写入时打 warning。
 * - 历史明文数据不带 `enc:v1:` 前缀，读取时原样返回，下次保存时自动加密。
 */

const PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

let cachedKey: Buffer | null = null;
let keyResolved = false;

function getKey(): Buffer | null {
  if (keyResolved) return cachedKey;
  keyResolved = true;
  // 惰性读取，确保 dotenv / 平台环境变量已注入
  const secret = process.env.AI_SETTING_ENCRYPTION_KEY ?? '';
  if (secret.length < 16) {
    cachedKey = null;
  } else {
    cachedKey = scryptSync(secret, 'ai-setting-encryption-v1', 32);
  }
  return cachedKey;
}

export function isEncryptionEnabled(): boolean {
  return getKey() !== null;
}

export function encryptSecret(plain: string): string {
  const key = getKey();
  if (!key) return plain;
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return (
    PREFIX +
    [iv, tag, ciphertext].map((buf) => buf.toString('base64')).join(':')
  );
}

export function decryptSecret(stored: string | null): string | null {
  if (!stored) return null;
  // 历史明文（无前缀）原样返回
  if (!stored.startsWith(PREFIX)) return stored;

  const key = getKey();
  if (!key) return null;

  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 3) return null;

  try {
    const [iv, tag, ciphertext] = parts.map((p) => Buffer.from(p, 'base64'));
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  } catch {
    return null;
  }
}
