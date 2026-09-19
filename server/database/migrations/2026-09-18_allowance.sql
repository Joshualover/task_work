-- ============================================================================
-- 迁移：零花钱账单（余额 / 流水 / 使用申请 / 奖励关联）
-- 日期：2026-09-18
--
-- child.allowance_balance     零花钱余额（单位：分）
-- reward.reward_type          奖励类型：item | allowance
-- reward.allowance_amount     零花钱金额（分，reward_type=allowance 时有意义）
-- allowance_transaction       零花钱流水
-- allowance_request           零花钱使用申请（孩子发起，家长审批）
-- ============================================================================

BEGIN;

ALTER TABLE child ADD COLUMN IF NOT EXISTS allowance_balance integer NOT NULL DEFAULT 0;

ALTER TABLE reward ADD COLUMN IF NOT EXISTS reward_type varchar(20) NOT NULL DEFAULT 'item';
ALTER TABLE reward ADD COLUMN IF NOT EXISTS allowance_amount integer;

CREATE TABLE IF NOT EXISTS allowance_transaction (
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
  CONSTRAINT allowance_transaction_child_id_fkey FOREIGN KEY (child_id) REFERENCES child(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_allowance_transaction_child_id ON allowance_transaction (child_id);
CREATE INDEX IF NOT EXISTS idx_allowance_transaction_created_at ON allowance_transaction (_created_at);

CREATE TABLE IF NOT EXISTS allowance_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL,
  amount integer NOT NULL,
  purpose varchar(200),
  status varchar(20) NOT NULL DEFAULT 'pending',
  review_note varchar(500),
  reviewed_at timestamptz(3),
  _created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END),
  _updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (CASE WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL::user_profile END),
  CONSTRAINT allowance_request_child_id_fkey FOREIGN KEY (child_id) REFERENCES child(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_allowance_request_child_id ON allowance_request (child_id);
CREATE INDEX IF NOT EXISTS idx_allowance_request_status ON allowance_request (status);

COMMIT;
