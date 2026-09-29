-- 任务可同时奖励「零花钱」：完成并通过家长审批后，除积分外再入账零花钱
-- 金额单位：分（与 allowance_* 一致），0 表示不奖励零花钱
ALTER TABLE task_template
  ADD COLUMN IF NOT EXISTS allowance_amount integer NOT NULL DEFAULT 0;

ALTER TABLE task_instance
  ADD COLUMN IF NOT EXISTS allowance_amount integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN task_template.allowance_amount IS '完成任务额外奖励的零花钱（分），0=不奖励';
COMMENT ON COLUMN task_instance.allowance_amount IS '完成任务额外奖励的零花钱（分），0=不奖励';

-- 约束：不允许负数（避免审批时反向扣钱）
ALTER TABLE task_template DROP CONSTRAINT IF EXISTS chk_task_template_allowance_non_negative;
ALTER TABLE task_template
  ADD CONSTRAINT chk_task_template_allowance_non_negative
  CHECK (allowance_amount >= 0);

ALTER TABLE task_instance DROP CONSTRAINT IF EXISTS chk_task_instance_allowance_non_negative;
ALTER TABLE task_instance
  ADD CONSTRAINT chk_task_instance_allowance_non_negative
  CHECK (allowance_amount >= 0);
