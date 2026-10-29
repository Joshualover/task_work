-- 模板级「自动派发」开关
-- 背景：此前必要任务要在任务池页手动点「生成每日任务」才会实例化；
-- 家长希望每天零点系统自动把必要任务加入任务池，无需手动操作。
-- 默认 true：现有模板升级后立即享受自动派发，开关用于个别模板退出自动。
ALTER TABLE task_template
  ADD COLUMN IF NOT EXISTS auto_generate boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN task_template.auto_generate IS
  '必要任务模板：是否每天零点自动派发任务实例（false=仅在手动点击「生成每日任务」时派发）';
