-- 零花钱目标：目标型任务的进度自动跟随孩子的零花钱余额
-- 背景：家长设置「存够 100 元买玩具」这类目标时，不想让孩子手动记进度，
--       而是希望进度 = 零花钱余额，余额涨多少进度就涨多少。
ALTER TABLE task_instance
  ADD COLUMN IF NOT EXISTS linked_allowance_goal boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN task_instance.linked_allowance_goal IS
  '目标型任务是否跟随零花钱余额（true 时 current_value 由 allowance_balance 折算，单位为元）';

-- 便于同步时快速捞出「进行中的零花钱目标」
CREATE INDEX IF NOT EXISTS idx_task_instance_allowance_goal
  ON task_instance (child_id, type, linked_allowance_goal)
  WHERE linked_allowance_goal = true;
