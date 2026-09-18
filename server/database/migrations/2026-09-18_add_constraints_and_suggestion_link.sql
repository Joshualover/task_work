-- ============================================================================
-- 迁移：约束补强 + 任务实例与作业建议关联
-- 日期：2026-09-18
--
-- 背景：
--   1) family 没有 _created_by 唯一约束，并发首次请求会创建重复家庭；
--   2) task_instance 没有唯一约束，并发 generate-daily 会插入重复每日任务；
--   3) task_instance 缺少 suggestion_id，孩子端只能用 name+subject+points
--      启发式匹配作业建议，同名同分时错配。
--
-- 说明：
--   * 脚本可重复执行（IF NOT EXISTS）。
--   * 平台若通过「数据表设计器」管理 DDL，请在设计器中做等价变更后执行
--     `npm run gen:db-schema`，本文件作为参考与直接连库执行的兜底。
--   * 应用代码已对 suggestion_id 为空做降级处理，但列必须存在（Drizzle 会
--     在 SELECT 中带上该列），因此**请先应用本迁移再部署代码**。
-- ============================================================================

BEGIN;

-- 1) 一个用户至多一个家庭（NULL 表示匿名，不参与唯一约束）
CREATE UNIQUE INDEX IF NOT EXISTS idx_family_created_by
  ON family (_created_by)
  WHERE _created_by IS NOT NULL;

-- 2) 同一孩子 + 同一模板 + 同一天，每日任务不可重复
--    （task_template_id 为 NULL 的作业任务不受影响：Postgres 唯一索引视 NULL 互不相等）
--    若历史数据已存在重复，请先清理后再执行本语句：
--      SELECT child_id, task_template_id, task_date, count(*)
--      FROM task_instance
--      WHERE task_template_id IS NOT NULL
--      GROUP BY 1,2,3 HAVING count(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_instance_daily_unique
  ON task_instance (child_id, task_template_id, task_date);

-- 3) task_instance 关联作业建议
ALTER TABLE task_instance
  ADD COLUMN IF NOT EXISTS suggestion_id uuid;

CREATE INDEX IF NOT EXISTS idx_task_instance_suggestion_id
  ON task_instance (suggestion_id);

ALTER TABLE task_instance
  DROP CONSTRAINT IF EXISTS task_instance_suggestion_id_fkey;

ALTER TABLE task_instance
  ADD CONSTRAINT task_instance_suggestion_id_fkey
  FOREIGN KEY (suggestion_id) REFERENCES homework_suggestion(id) ON DELETE SET NULL;

COMMIT;
