-- ============================================================================
-- 迁移：目标型任务
-- 日期：2026-09-18
--
-- task_instance.target_value   目标值（如 100）
-- task_instance.current_value  当前进度（默认 0）
-- task_instance.unit           单位（如 个 / 页 / 分钟）
-- type 为 'goal' 的任务：进度达到 target_value 即视为完成（进入待确认）
-- ============================================================================

BEGIN;

ALTER TABLE task_instance ADD COLUMN IF NOT EXISTS target_value integer;
ALTER TABLE task_instance ADD COLUMN IF NOT EXISTS current_value integer NOT NULL DEFAULT 0;
ALTER TABLE task_instance ADD COLUMN IF NOT EXISTS unit varchar(20);

COMMIT;
