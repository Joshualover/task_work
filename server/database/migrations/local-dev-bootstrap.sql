-- ============================================================================
-- 本地开发用建表脚本（严格对齐 server/database/schema.ts）
-- 仅用于无平台环境时本地起服务，不替代平台的真实 DDL / RLS 策略。
-- ============================================================================

-- 自定义复合类型
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_profile') THEN
    CREATE TYPE user_profile AS (user_id text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'file_attachment') THEN
    CREATE TYPE file_attachment AS (bucket_id text, file_path text);
  END IF;
END $$;

-- 平台中间件会 `SET LOCAL ROLE 'anon_' / 'authenticated_' / 'service_role_'`
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon_') THEN CREATE ROLE anon_ SUPERUSER LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated_') THEN CREATE ROLE authenticated_ SUPERUSER LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role_') THEN CREATE ROLE service_role_ SUPERUSER LOGIN; END IF;
END $$;

-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS family (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  invite_code varchar(20),
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END),
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_family_created_by ON family (_created_by) WHERE _created_by IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_family_invite_code ON family (invite_code);

CREATE TABLE IF NOT EXISTS child (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  name varchar(50) NOT NULL,
  avatar_url text,
  points integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END),
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END),
  CONSTRAINT child_family_id_fkey FOREIGN KEY (family_id) REFERENCES family(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_child_family_id ON child (family_id);

CREATE TABLE IF NOT EXISTS ai_recognition_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  child_id uuid,
  input_type varchar(20) NOT NULL,
  input_content text,
  image_url text,
  result_json jsonb,
  status varchar(20) NOT NULL DEFAULT 'pending',
  error_message text,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END),
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END),
  CONSTRAINT ai_recognition_log_family_id_fkey FOREIGN KEY (family_id) REFERENCES family(id) ON DELETE CASCADE,
  CONSTRAINT ai_recognition_log_child_id_fkey FOREIGN KEY (child_id) REFERENCES child(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_recognition_log_family_id ON ai_recognition_log (family_id);

CREATE TABLE IF NOT EXISTS ai_setting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  api_url varchar(500),
  api_key varchar(200),
  model_name varchar(100),
  is_enabled boolean NOT NULL DEFAULT false,
  image_api_url varchar(500),
  image_api_key varchar(200),
  image_model_name varchar(100),
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END),
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END),
  CONSTRAINT ai_setting_family_id_fkey FOREIGN KEY (family_id) REFERENCES family(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_setting_family_id ON ai_setting (family_id);

CREATE TABLE IF NOT EXISTS homework_suggestion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL,
  recognition_log_id uuid,
  subject varchar(50) NOT NULL,
  content varchar(500) NOT NULL,
  quantity integer DEFAULT 1,
  suggested_points integer NOT NULL DEFAULT 10,
  deadline date,
  status varchar(20) NOT NULL DEFAULT 'pending',
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END),
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END),
  CONSTRAINT homework_suggestion_child_id_fkey FOREIGN KEY (child_id) REFERENCES child(id) ON DELETE CASCADE,
  CONSTRAINT homework_suggestion_recognition_log_id_fkey FOREIGN KEY (recognition_log_id) REFERENCES ai_recognition_log(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_homework_suggestion_child_id ON homework_suggestion (child_id);
CREATE INDEX IF NOT EXISTS idx_homework_suggestion_status ON homework_suggestion (status);

CREATE TABLE IF NOT EXISTS homework_subtask (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id uuid NOT NULL,
  content varchar(500) NOT NULL,
  points integer NOT NULL DEFAULT 5,
  sort_order integer NOT NULL DEFAULT 0,
  is_completed boolean NOT NULL DEFAULT false,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END),
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END),
  CONSTRAINT homework_subtask_suggestion_id_fkey FOREIGN KEY (suggestion_id) REFERENCES homework_suggestion(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_homework_subtask_suggestion_id ON homework_subtask (suggestion_id);

CREATE TABLE IF NOT EXISTS task_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  name varchar(100) NOT NULL,
  default_points integer NOT NULL DEFAULT 10,
  is_daily boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  frequency varchar(20) NOT NULL DEFAULT 'daily',
  week_days integer[] DEFAULT '{}',
  month_days integer[] DEFAULT '{}',
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END),
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END),
  CONSTRAINT task_template_family_id_fkey FOREIGN KEY (family_id) REFERENCES family(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_task_template_family_id ON task_template (family_id);

CREATE TABLE IF NOT EXISTS task_instance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL,
  task_template_id uuid,
  suggestion_id uuid,
  type varchar(20) NOT NULL DEFAULT 'daily',
  name varchar(200) NOT NULL,
  subject varchar(50),
  points integer NOT NULL DEFAULT 10,
  difficulty_multiplier numeric NOT NULL DEFAULT '1.0',
  final_points integer,
  deadline date,
  task_date date NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  submit_time timestamptz(3),
  reject_reason varchar(500),
  completion_note text,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END),
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END),
  CONSTRAINT task_instance_child_id_fkey FOREIGN KEY (child_id) REFERENCES child(id) ON DELETE CASCADE,
  CONSTRAINT task_instance_task_template_id_fkey FOREIGN KEY (task_template_id) REFERENCES task_template(id) ON DELETE SET NULL,
  CONSTRAINT task_instance_suggestion_id_fkey FOREIGN KEY (suggestion_id) REFERENCES homework_suggestion(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_task_instance_child_id ON task_instance (child_id);
CREATE INDEX IF NOT EXISTS idx_task_instance_task_date ON task_instance (task_date);
CREATE INDEX IF NOT EXISTS idx_task_instance_status ON task_instance (status);
CREATE INDEX IF NOT EXISTS idx_task_instance_suggestion_id ON task_instance (suggestion_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_instance_daily_unique ON task_instance (child_id, task_template_id, task_date);

CREATE TABLE IF NOT EXISTS reward (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  name varchar(100) NOT NULL,
  points_required integer NOT NULL,
  description text,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  frequency varchar(20) NOT NULL DEFAULT 'unlimited',
  limit_count integer,
  limit_points integer,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END),
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END),
  CONSTRAINT reward_family_id_fkey FOREIGN KEY (family_id) REFERENCES family(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_reward_family_id ON reward (family_id);

CREATE TABLE IF NOT EXISTS redemption (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL,
  reward_id uuid NOT NULL,
  reward_name varchar(100) NOT NULL,
  points_cost integer NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  review_note varchar(500),
  reviewed_at timestamptz(3),
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END),
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END),
  CONSTRAINT redemption_child_id_fkey FOREIGN KEY (child_id) REFERENCES child(id) ON DELETE CASCADE,
  CONSTRAINT redemption_reward_id_fkey FOREIGN KEY (reward_id) REFERENCES reward(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_redemption_child_id ON redemption (child_id);
CREATE INDEX IF NOT EXISTS idx_redemption_status ON redemption (status);

CREATE TABLE IF NOT EXISTS point_transaction (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL,
  change_amount integer NOT NULL,
  balance_after integer NOT NULL,
  type varchar(20) NOT NULL,
  related_type varchar(20),
  related_id uuid,
  reason varchar(500),
  operator user_profile,
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END),
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END),
  CONSTRAINT point_transaction_child_id_fkey FOREIGN KEY (child_id) REFERENCES child(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_point_transaction_child_id ON point_transaction (child_id);
CREATE INDEX IF NOT EXISTS idx_point_transaction_created_at ON point_transaction (_created_at);

-- 应用级登录账号（独立部署）
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
