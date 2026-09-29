-- 余额非负 CHECK 约束 + 高频查询缺失索引补齐
-- 上下文：reviewTask 旧版"读-改-写"并发 bug 可能产生过负余额/账实不符数据；
-- 本迁移先清理脏数据再加约束，保证数据库层面兜底。

BEGIN;

-- ============ 1. 余额非负约束 ============
-- 历史脏数据清零（负余额不符合业务语义，多为旧版并发 bug 所致）
UPDATE child SET points = 0 WHERE points < 0;
UPDATE child SET allowance_balance = 0 WHERE allowance_balance < 0;

ALTER TABLE child DROP CONSTRAINT IF EXISTS chk_child_points_non_negative;
ALTER TABLE child
  ADD CONSTRAINT chk_child_points_non_negative CHECK (points >= 0);

ALTER TABLE child DROP CONSTRAINT IF EXISTS chk_child_allowance_balance_non_negative;
ALTER TABLE child
  ADD CONSTRAINT chk_child_allowance_balance_non_negative
  CHECK (allowance_balance >= 0);

-- ============ 2. 高频查询索引 ============

-- 积分流水：按孩子查列表（分页 + 时间排序）
CREATE INDEX IF NOT EXISTS idx_point_transaction_child_created
  ON point_transaction (child_id, _created_at DESC);

-- 积分流水：按关联对象追溯（任务/奖励/调整），多态关联无 FK，靠索引兜底
CREATE INDEX IF NOT EXISTS idx_point_transaction_related
  ON point_transaction (related_id)
  WHERE related_id IS NOT NULL;

-- 零花钱流水：按孩子查列表
CREATE INDEX IF NOT EXISTS idx_allowance_transaction_child_created
  ON allowance_transaction (child_id, _created_at DESC);

-- 零花钱申请：按孩子过滤
CREATE INDEX IF NOT EXISTS idx_allowance_request_child
  ON allowance_request (child_id, _created_at DESC);

-- 兑换记录：限额校验查询路径（child + reward + 时间范围）
CREATE INDEX IF NOT EXISTS idx_redemption_child_reward_created
  ON redemption (child_id, reward_id, _created_at);

-- 任务实例：按孩子 + 日期拉取当日/区间任务
CREATE INDEX IF NOT EXISTS idx_task_instance_child_date
  ON task_instance (child_id, task_date);

COMMIT;
