/* eslint-disable */
/** auto generated, do not edit */
import { sql } from 'drizzle-orm';
import { boolean, date, foreignKey, index, integer, jsonb, numeric, pgTable, text, uniqueIndex, uuid, varchar, customType } from "drizzle-orm/pg-core"

export const customTimestamptz = customType<{
  data: Date;
  driverData: string;
  config: { precision?: number };
}>({
  dataType(config) {
    const precision = typeof config?.precision !== 'undefined'
      ? ` (${config.precision})`
      : '';
    return `timestamptz${precision}`;
  },
  toDriver(value: Date | string | number) {
    if (value == null) return value as any;
    if (typeof value === 'number') return new Date(value).toISOString();
    if (typeof value === 'string') return value;
    if (value instanceof Date) return value.toISOString();
    throw new Error('Invalid timestamp value');
  },
  fromDriver(value: string | Date): Date {
    if (value instanceof Date) return value;
    return new Date(value);
  },
});

export const userProfile = customType<{
  data: string;
  driverData: string;
}>({
  dataType() {
    return 'user_profile';
  },
  toDriver(value: string) {
    return sql`ROW(${value})::user_profile`;
  },
  fromDriver(value: string) {
    const [userId] = value.slice(1, -1).split(',');
    return userId.trim();
  },
});

export type FileAttachment = {
  bucket_id: string;
  file_path: string;
};

export const fileAttachment = customType<{
  data: FileAttachment;
  driverData: string;
}>({
  dataType() {
    return 'file_attachment';
  },
  toDriver(value: FileAttachment) {
    return sql`ROW(${value.bucket_id},${value.file_path})::file_attachment`;
  },
  fromDriver(value: string): FileAttachment {
    const [bucketId, filePath] = value.slice(1, -1).split(',');
    return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
  },
});

export function escapeLiteral(str: string): string {
  return "'" + str.replace(/'/g, "''") + "'";
}

export const userProfileArray = customType<{
  data: string[];
  driverData: string;
}>({
  dataType() {
    return 'user_profile[]';
  },
  toDriver(value: string[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::user_profile[]`;
    }
    const elements = value.map(id => `ROW(${escapeLiteral(id)})::user_profile`).join(',');
    return sql.raw(`ARRAY[${elements}]::user_profile[]`);
  },
  fromDriver(value: string): string[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => m.slice(1, -1).split(',')[0].trim());
  },
});

export const fileAttachmentArray = customType<{
  data: FileAttachment[];
  driverData: string;
}>({
  dataType() {
    return 'file_attachment[]';
  },
  toDriver(value: FileAttachment[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::file_attachment[]`;
    }
    const elements = value.map(f =>
      `ROW(${escapeLiteral(f.bucket_id)},${escapeLiteral(f.file_path)})::file_attachment`
    ).join(',');
    return sql.raw(`ARRAY[${elements}]::file_attachment[]`);
  },
  fromDriver(value: string): FileAttachment[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => {
      const [bucketId, filePath] = m.slice(1, -1).split(',');
      return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
    });
  },
});

export const homeworkSubtask = pgTable("homework_subtask", {
  id: uuid("id").primaryKey().defaultRandom(),
  suggestionId: uuid("suggestion_id").notNull(),
  content: varchar("content", { length: 500 }).notNull(),
  points: integer("points").notNull().default(5),
  sortOrder: integer("sort_order").notNull().default(0),
  isCompleted: boolean("is_completed").notNull().default(false),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_homework_subtask_suggestion_id").on(table.suggestionId),
  foreignKey({
    columns: [table.suggestionId],
    foreignColumns: [homeworkSuggestion.id],
    name: "homework_subtask_suggestion_id_fkey",
  }).onDelete("cascade"),
]);

export const homeworkSuggestion = pgTable("homework_suggestion", {
  id: uuid("id").primaryKey().defaultRandom(),
  childId: uuid("child_id").notNull(),
  recognitionLogId: uuid("recognition_log_id"),
  subject: varchar("subject", { length: 50 }).notNull(),
  content: varchar("content", { length: 500 }).notNull(),
  quantity: integer("quantity").default(1),
  suggestedPoints: integer("suggested_points").notNull().default(10),
  deadline: date("deadline"),
  status: varchar("status", { length: 20 }).notNull().default('pending'),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_homework_suggestion_child_id").on(table.childId),
  index("idx_homework_suggestion_status").on(table.status),
  foreignKey({
    columns: [table.childId],
    foreignColumns: [child.id],
    name: "homework_suggestion_child_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.recognitionLogId],
    foreignColumns: [aiRecognitionLog.id],
    name: "homework_suggestion_recognition_log_id_fkey",
  }).onDelete("set null"),
]);

export const aiRecognitionLog = pgTable("ai_recognition_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull(),
  childId: uuid("child_id"),
  inputType: varchar("input_type", { length: 20 }).notNull(),
  inputContent: text("input_content"),
  imageUrl: text("image_url"),
  /**
   * @type { tasks: Array<{ subject: string, content: string, quantity: number, suggestedPoints: number }> }
   */
  resultJson: jsonb("result_json"),
  status: varchar("status", { length: 20 }).notNull().default('pending'),
  errorMessage: text("error_message"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_ai_recognition_log_family_id").on(table.familyId),
  foreignKey({
    columns: [table.familyId],
    foreignColumns: [family.id],
    name: "ai_recognition_log_family_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.childId],
    foreignColumns: [child.id],
    name: "ai_recognition_log_child_id_fkey",
  }).onDelete("set null"),
]);

export const aiSetting = pgTable("ai_setting", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().unique(),
  apiUrl: varchar("api_url", { length: 500 }),
  apiKey: varchar("api_key", { length: 200 }),
  modelName: varchar("model_name", { length: 100 }),
  isEnabled: boolean("is_enabled").notNull().default(false),
  imageApiUrl: varchar("image_api_url", { length: 500 }),
  imageApiKey: varchar("image_api_key", { length: 200 }),
  imageModelName: varchar("image_model_name", { length: 100 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("idx_ai_setting_family_id").on(table.familyId),
  foreignKey({
    columns: [table.familyId],
    foreignColumns: [family.id],
    name: "ai_setting_family_id_fkey",
  }).onDelete("cascade"),
]);

export const redemption = pgTable("redemption", {
  id: uuid("id").primaryKey().defaultRandom(),
  childId: uuid("child_id").notNull(),
  rewardId: uuid("reward_id").notNull(),
  rewardName: varchar("reward_name", { length: 100 }).notNull(),
  pointsCost: integer("points_cost").notNull(),
  status: varchar("status", { length: 20 }).notNull().default('pending'),
  reviewNote: varchar("review_note", { length: 500 }),
  reviewedAt: customTimestamptz("reviewed_at", { precision: 3 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_redemption_child_id").on(table.childId),
  index("idx_redemption_status").on(table.status),
  foreignKey({
    columns: [table.childId],
    foreignColumns: [child.id],
    name: "redemption_child_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.rewardId],
    foreignColumns: [reward.id],
    name: "redemption_reward_id_fkey",
  }).onDelete("cascade"),
]);

export const reward = pgTable("reward", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  pointsRequired: integer("points_required").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  // 兑奖频率与额度：unlimited | daily | weekly | monthly
  frequency: varchar("frequency", { length: 20 }).notNull().default('unlimited'),
  // 每个周期内的兑换次数上限（null = 不限）
  limitCount: integer("limit_count"),
  // 每个周期内可消耗的积分上限（null = 不限）
  limitPoints: integer("limit_points"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_reward_family_id").on(table.familyId),
  foreignKey({
    columns: [table.familyId],
    foreignColumns: [family.id],
    name: "reward_family_id_fkey",
  }).onDelete("cascade"),
]);

export const pointTransaction = pgTable("point_transaction", {
  id: uuid("id").primaryKey().defaultRandom(),
  childId: uuid("child_id").notNull(),
  changeAmount: integer("change_amount").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  relatedType: varchar("related_type", { length: 20 }),
  relatedId: uuid("related_id"),
  reason: varchar("reason", { length: 500 }),
  operator: userProfile("operator"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_point_transaction_child_id").on(table.childId),
  index("idx_point_transaction_created_at").on(table.createdAt),
  foreignKey({
    columns: [table.childId],
    foreignColumns: [child.id],
    name: "point_transaction_child_id_fkey",
  }).onDelete("cascade"),
]);

export const taskInstance = pgTable("task_instance", {
  id: uuid("id").primaryKey().defaultRandom(),
  childId: uuid("child_id").notNull(),
  taskTemplateId: uuid("task_template_id"),
  // 关联作业建议（见 migrations/2026-09-18_add_constraints_and_suggestion_link.sql）
  suggestionId: uuid("suggestion_id"),
  type: varchar("type", { length: 20 }).notNull().default('daily'),
  name: varchar("name", { length: 200 }).notNull(),
  subject: varchar("subject", { length: 50 }),
  points: integer("points").notNull().default(10),
  difficultyMultiplier: numeric("difficulty_multiplier").notNull().default('1.0'),
  finalPoints: integer("final_points"),
  deadline: date("deadline"),
  taskDate: date("task_date").notNull(),
  status: varchar("status", { length: 20 }).notNull().default('pending'),
  submitTime: customTimestamptz("submit_time", { precision: 3 }),
  rejectReason: varchar("reject_reason", { length: 500 }),
  completionNote: text("completion_note"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_task_instance_child_id").on(table.childId),
  index("idx_task_instance_task_date").on(table.taskDate),
  index("idx_task_instance_status").on(table.status),
  index("idx_task_instance_suggestion_id").on(table.suggestionId),
  uniqueIndex("idx_task_instance_daily_unique").on(table.childId, table.taskTemplateId, table.taskDate),
  foreignKey({
    columns: [table.childId],
    foreignColumns: [child.id],
    name: "task_instance_child_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.taskTemplateId],
    foreignColumns: [taskTemplate.id],
    name: "task_instance_task_template_id_fkey",
  }).onDelete("set null"),
  foreignKey({
    columns: [table.suggestionId],
    foreignColumns: [homeworkSuggestion.id],
    name: "task_instance_suggestion_id_fkey",
  }).onDelete("set null"),
]);

export const taskTemplate = pgTable("task_template", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  defaultPoints: integer("default_points").notNull().default(10),
  isDaily: boolean("is_daily").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  frequency: varchar("frequency", { length: 20 }).notNull().default('daily'),
  weekDays: integer("week_days").array().default([]),
  monthDays: integer("month_days").array().default([]),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_task_template_family_id").on(table.familyId),
  foreignKey({
    columns: [table.familyId],
    foreignColumns: [family.id],
    name: "task_template_family_id_fkey",
  }).onDelete("cascade"),
]);

export const child = pgTable("child", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull(),
  name: varchar("name", { length: 50 }).notNull(),
  avatarUrl: text("avatar_url"),
  points: integer("points").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  index("idx_child_family_id").on(table.familyId),
  foreignKey({
    columns: [table.familyId],
    foreignColumns: [family.id],
    name: "child_family_id_fkey",
  }).onDelete("cascade"),
]);

export const family = pgTable("family", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  // 家庭邀请码（孩子注册时使用）
  inviteCode: varchar("invite_code", { length: 20 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("idx_family_created_by").on(table.createdBy),
  uniqueIndex("idx_family_invite_code").on(table.inviteCode),
]);

// 应用级登录账号（独立部署使用；平台模式不用）
export const appUser = pgTable("app_user", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull(),
  username: varchar("username", { length: 50 }).notNull(),
  passwordHash: varchar("password_hash", { length: 200 }).notNull(),
  role: varchar("role", { length: 10 }).notNull().default('parent'),
  childId: uuid("child_id"),
  displayName: varchar("display_name", { length: 50 }),
  isActive: boolean("is_active").notNull().default(true),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  uniqueIndex("idx_app_user_username").on(table.username),
  index("idx_app_user_family_id").on(table.familyId),
  index("idx_app_user_child_id").on(table.childId),
  foreignKey({
    columns: [table.familyId],
    foreignColumns: [family.id],
    name: "app_user_family_id_fkey",
  }).onDelete("cascade"),
  foreignKey({
    columns: [table.childId],
    foreignColumns: [child.id],
    name: "app_user_child_id_fkey",
  }).onDelete("set null"),
]);

// table aliases
export const aiRecognitionLogTable = aiRecognitionLog;
export const aiSettingTable = aiSetting;
export const appUserTable = appUser;
export const childTable = child;
export const familyTable = family;
export const homeworkSubtaskTable = homeworkSubtask;
export const homeworkSuggestionTable = homeworkSuggestion;
export const pointTransactionTable = pointTransaction;
export const redemptionTable = redemption;
export const rewardTable = reward;
export const taskInstanceTable = taskInstance;
export const taskTemplateTable = taskTemplate;
