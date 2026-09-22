-- 补提交：任务逾期后，孩子可申请补提交，由家长审批决定是否计入
ALTER TABLE task_instance
  ADD COLUMN IF NOT EXISTS is_late_submit boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN task_instance.is_late_submit IS '是否为逾期后的补提交（提交时任务已逾期）';
