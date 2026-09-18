/**
 * Postgres 错误判断工具。
 */

/** 唯一约束冲突（23505） */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === '23505'
  );
}
