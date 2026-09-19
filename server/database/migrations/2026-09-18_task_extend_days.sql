-- ============================================================================
-- 迁移：作业顺延（遇周末/节假日）
-- 日期：2026-09-18
--
-- task_instance.extend_days      作业截止日后的顺延天数（顺延期内不算逾期）
-- homework_suggestion.extend_days 建议上的顺延天数（确认时复制到任务实例）
-- ============================================================================

BEGIN;

ALTER TABLE task_instance ADD COLUMN IF NOT EXISTS extend_days integer NOT NULL DEFAULT 0;
ALTER TABLE homework_suggestion ADD COLUMN IF NOT EXISTS extend_days integer NOT NULL DEFAULT 0;

COMMIT;
