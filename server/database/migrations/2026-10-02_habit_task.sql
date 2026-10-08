-- 习惯任务：按次计算的任务（如「每天喝水 8 次」「刷牙 3 次」）
-- 每完成一次立刻发放积分/零花钱；每天次数自动归零。
ALTER TABLE task_instance
  ADD COLUMN IF NOT EXISTS habit_last_date date;

COMMENT ON COLUMN task_instance.habit_last_date IS
  '习惯任务：current_value（今日次数）所属的日期；跨天读取时自动归零';

-- 习惯任务常驻展示（跨天保留），单独索引便于捞取
CREATE INDEX IF NOT EXISTS idx_task_instance_habit
  ON task_instance (child_id, type)
  WHERE type = 'habit';
