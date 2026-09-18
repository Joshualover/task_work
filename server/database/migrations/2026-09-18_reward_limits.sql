-- ============================================================================
-- 迁移：奖励兑奖频率与额度限制
-- 日期：2026-09-18
--
-- 为 reward 增加：
--   frequency   兑奖频率：unlimited | daily | weekly | monthly
--   limit_count 每个周期内兑换次数上限（NULL = 不限）
--   limit_points 每个周期内可消耗积分上限（NULL = 不限）
-- ============================================================================

BEGIN;

ALTER TABLE reward ADD COLUMN IF NOT EXISTS frequency varchar(20) NOT NULL DEFAULT 'unlimited';
ALTER TABLE reward ADD COLUMN IF NOT EXISTS limit_count integer;
ALTER TABLE reward ADD COLUMN IF NOT EXISTS limit_points integer;

COMMIT;
