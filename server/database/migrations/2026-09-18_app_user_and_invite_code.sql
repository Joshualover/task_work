-- ============================================================================
-- 迁移：应用级登录（app_user 表 + family.invite_code）
-- 日期：2026-09-18
--
-- 说明：独立部署（NAS / 自有服务器）启用应用级登录（APP_LOGIN=true）时需要。
--       平台托管登录的部署可忽略。
--       新建数据库直接用 local-dev-bootstrap.sql 即可，无需本文件。
-- ============================================================================

BEGIN;

-- 家庭邀请码（孩子注册时使用）
ALTER TABLE family ADD COLUMN IF NOT EXISTS invite_code varchar(20);
CREATE UNIQUE INDEX IF NOT EXISTS idx_family_invite_code ON family (invite_code);

-- 应用级登录账号
CREATE TABLE IF NOT EXISTS app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  username varchar(50) NOT NULL,
  password_hash varchar(200) NOT NULL,
  role varchar(10) NOT NULL DEFAULT 'parent',
  child_id uuid,
  display_name varchar(50),
  is_active boolean NOT NULL DEFAULT true,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END),
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END),
  CONSTRAINT app_user_family_id_fkey FOREIGN KEY (family_id) REFERENCES family(id) ON DELETE CASCADE,
  CONSTRAINT app_user_child_id_fkey FOREIGN KEY (child_id) REFERENCES child(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_user_username ON app_user (username);
CREATE INDEX IF NOT EXISTS idx_app_user_family_id ON app_user (family_id);
CREATE INDEX IF NOT EXISTS idx_app_user_child_id ON app_user (child_id);

COMMIT;
