-- 习惯任务「需家长确认」开关 + 打卡待确认记录
-- 背景：多数习惯（喝水/刷牙）打卡即可得；但有的习惯（自己做一顿饭）需要家长确认后再发奖。
ALTER TABLE task_instance
  ADD COLUMN IF NOT EXISTS habit_need_approval boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN task_instance.habit_need_approval IS
  '习惯任务：打卡是否需要家长确认后才发放奖励（false=打卡立即发奖）';

-- 每次打卡一条记录；需确认的习惯先记 pending，家长通过后再发奖
CREATE TABLE IF NOT EXISTS habit_checkin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_instance_id uuid NOT NULL,
  child_id uuid NOT NULL,
  -- 打卡时的第几次（用于展示"第 3 次"）
  seq integer NOT NULL DEFAULT 1,
  -- pending | approved | rejected
  status varchar(20) NOT NULL DEFAULT 'pending',
  -- 奖励快照（打卡时的配置，避免家长中途改配置导致金额漂移）
  points integer NOT NULL DEFAULT 0,
  allowance_amount integer NOT NULL DEFAULT 0,
  note varchar(200),
  reject_reason varchar(500),
  reviewed_at timestamptz(3),
  reviewed_by uuid,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END),
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END),
  CONSTRAINT habit_checkin_task_fkey FOREIGN KEY (task_instance_id)
    REFERENCES task_instance(id) ON DELETE CASCADE,
  CONSTRAINT habit_checkin_child_fkey FOREIGN KEY (child_id)
    REFERENCES child(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_habit_checkin_task ON habit_checkin (task_instance_id, _created_at DESC);
CREATE INDEX IF NOT EXISTS idx_habit_checkin_child_status ON habit_checkin (child_id, status);
