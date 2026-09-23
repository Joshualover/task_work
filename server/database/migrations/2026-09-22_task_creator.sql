-- 记录任务「由哪位家长布置」，用于孩子端展示（如「妈妈 布置」）
-- 同时保存 id 与昵称快照：id 便于后续做权限/统计，昵称快照保证账号被删后仍可展示
ALTER TABLE task_instance
  ADD COLUMN IF NOT EXISTS creator_user_id uuid,
  ADD COLUMN IF NOT EXISTS creator_name varchar(50);

ALTER TABLE task_template
  ADD COLUMN IF NOT EXISTS creator_user_id uuid,
  ADD COLUMN IF NOT EXISTS creator_name varchar(50);

COMMENT ON COLUMN task_instance.creator_user_id IS '布置任务的家长账号 id（app_user.id）';
COMMENT ON COLUMN task_instance.creator_name IS '布置任务的家长昵称快照（孩子端展示用）';
COMMENT ON COLUMN task_template.creator_user_id IS '创建该必要任务模板的家长账号 id';
COMMENT ON COLUMN task_template.creator_name IS '创建该必要任务模板的家长昵称快照';

-- 历史数据回填：已有任务归到该家庭最早的家长账号，保证孩子端不会出现空白
UPDATE task_instance ti
SET creator_user_id = u.id,
    creator_name = COALESCE(u.display_name, u.username)
FROM child c
JOIN app_user u ON u.family_id = c.family_id AND u.role = 'parent'
WHERE ti.child_id = c.id
  AND ti.creator_user_id IS NULL
  AND u.id = (
    SELECT u2.id FROM app_user u2
    WHERE u2.family_id = c.family_id AND u2.role = 'parent'
    ORDER BY u2._created_at
    LIMIT 1
  );

UPDATE task_template tt
SET creator_user_id = u.id,
    creator_name = COALESCE(u.display_name, u.username)
FROM app_user u
WHERE tt.creator_user_id IS NULL
  AND u.family_id = tt.family_id
  AND u.role = 'parent'
  AND u.id = (
    SELECT u2.id FROM app_user u2
    WHERE u2.family_id = tt.family_id AND u2.role = 'parent'
    ORDER BY u2._created_at
    LIMIT 1
  );
