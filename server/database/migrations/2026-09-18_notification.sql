-- ============================================================================
-- 迁移：家长提醒（notification）
-- 日期：2026-09-18
--
-- 孩子提交任务 / 发起兑换或零花钱申请等需要家长处理时，向家庭写入一条提醒。
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  child_id uuid,
  type varchar(30) NOT NULL,
  title varchar(100) NOT NULL,
  body varchar(300),
  related_type varchar(20),
  related_id uuid,
  is_read boolean NOT NULL DEFAULT false,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END),
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END),
  CONSTRAINT notification_family_id_fkey FOREIGN KEY (family_id) REFERENCES family(id) ON DELETE CASCADE,
  CONSTRAINT notification_child_id_fkey FOREIGN KEY (child_id) REFERENCES child(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_notification_family_id ON notification (family_id);
CREATE INDEX IF NOT EXISTS idx_notification_is_read ON notification (is_read);

COMMIT;
