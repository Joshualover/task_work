/**
 * 从接口错误中提取可读信息。
 * 后端错误结构：{ error: { code, message, details } }
 */
export function getErrorMessage(
  error: unknown,
  fallback = '操作失败，请重试',
): string {
  const e = error as {
    response?: {
      data?: {
        message?: string;
        error?: { message?: string } | string;
      };
    };
    message?: string;
  };
  const data = e?.response?.data;
  const nested =
    data && typeof data.error === 'object' ? data.error?.message : undefined;
  const flat = typeof data?.error === 'string' ? data.error : undefined;
  return nested || data?.message || flat || e?.message || fallback;
}
