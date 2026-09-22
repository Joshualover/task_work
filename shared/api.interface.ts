// 小学生任务积分工作台 - 前后端共享类型定义

export interface Family {
  id: string;
  name: string;
  createdAt: string;
}

export interface Child {
  id: string;
  familyId: string;
  name: string;
  avatarUrl: string | null;
  points: number;
  /** 零花钱余额（单位：分） */
  allowanceBalance: number;
  isActive: boolean;
  createdAt: string;
}

export interface TaskTemplate {
  id: string;
  familyId: string;
  name: string;
  defaultPoints: number;
  isDaily: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  weekDays: number[];
  monthDays: number[];
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

export type TaskType = 'daily' | 'homework' | 'goal';
export type TaskStatus = 'pending' | 'submitted' | 'completed' | 'overdue' | 'rejected';

export interface TaskInstance {
  id: string;
  childId: string;
  taskTemplateId: string | null;
  suggestionId: string | null;
  type: TaskType;
  name: string;
  subject: string | null;
  points: number;
  difficultyMultiplier: number;
  /** 目标型任务：目标值 */
  targetValue: number | null;
  /** 目标型任务：当前进度 */
  currentValue: number;
  /** 目标型任务：单位（个/页/分钟…） */
  unit: string | null;
  finalPoints: number | null;
  deadline: string | null;
  /** 截止日后的顺延天数（顺延期内不算逾期） */
  extendDays: number;
  taskDate: string;
  status: TaskStatus;
  submitTime: string | null;
  rejectReason: string | null;
  completionNote: string | null;
  /** 是否为逾期后的补提交（提交时任务已逾期，需家长审批） */
  isLateSubmit: boolean;
  createdAt: string;
  /** 子任务（多项任务才有；由后端按 suggestionId 关联返回） */
  subtasks?: HomeworkSubtask[];
}

export type PointTransactionType = 'earn' | 'spend' | 'adjust_add' | 'adjust_sub' | 'refund';
export type PointTransactionRelatedType = 'task' | 'reward' | 'manual';

export interface PointTransaction {
  id: string;
  childId: string;
  changeAmount: number;
  balanceAfter: number;
  type: PointTransactionType;
  relatedType: PointTransactionRelatedType | null;
  relatedId: string | null;
  reason: string | null;
  createdAt: string;
}

export type RewardFrequency = 'unlimited' | 'daily' | 'weekly' | 'monthly';

export type RewardType = 'item' | 'allowance';

export interface Reward {
  id: string;
  familyId: string;
  name: string;
  pointsRequired: number;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  /** 兑奖频率 */
  frequency: RewardFrequency;
  /** 每周期兑换次数上限（null = 不限） */
  limitCount: number | null;
  /** 每周期可消耗积分上限（null = 不限） */
  limitPoints: number | null;
  /** 奖励类型：item（实物/权益） | allowance（零花钱） */
  rewardType: RewardType;
  /** 零花钱金额（分，rewardType=allowance 时有效） */
  allowanceAmount: number | null;
  createdAt: string;
}

export type RedemptionStatus = 'pending' | 'approved' | 'rejected' | 'locked';

export interface Redemption {
  id: string;
  childId: string;
  rewardId: string;
  rewardName: string;
  pointsCost: number;
  status: RedemptionStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface AiSetting {
  id: string;
  familyId: string;
  apiUrl: string | null;
  apiKey: string | null;
  modelName: string | null;
  imageApiUrl: string | null;
  imageApiKey: string | null;
  imageModelName: string | null;
  isEnabled: boolean;
  /** 是否已配置密钥（密钥本身不回传前端） */
  hasApiKey?: boolean;
  hasImageApiKey?: boolean;
}

export interface HomeworkSubtask {
  id: string;
  suggestionId: string;
  content: string;
  points: number;
  sortOrder: number;
  isCompleted: boolean;
  createdAt: string;
}

export interface HomeworkSuggestion {
  id: string;
  childId: string;
  recognitionLogId: string | null;
  subject: string;
  content: string;
  quantity: number;
  suggestedPoints: number;
  deadline: string | null;
  /** 截止日后的顺延天数 */
  extendDays: number;
  status: 'pending' | 'confirmed' | 'discarded';
  createdAt: string;
  subtasks: HomeworkSubtask[];
}

export interface AiRecognitionResult {
  tasks: Array<{
    subject: string;
    content: string;
    quantity: number;
    suggestedPoints: number;
  }>;
}

// ==================== 请求/响应类型 ====================

// 家庭
export interface CreateFamilyRequest {
  name: string;
}
export interface UpdateFamilyRequest {
  name: string;
}
export interface FamilyResponse {
  family: Family;
}

// 孩子
export interface ChildListResponse {
  items: Child[];
}
export interface CreateChildRequest {
  name: string;
  avatarUrl?: string;
}
export interface UpdateChildRequest {
  name?: string;
  avatarUrl?: string;
  isActive?: boolean;
}
export interface ChildResponse {
  child: Child;
}

// 任务模板
export interface TaskTemplateListResponse {
  items: TaskTemplate[];
}
export interface CreateTaskTemplateRequest {
  name: string;
  defaultPoints: number;
  isDaily: boolean;
  frequency?: 'daily' | 'weekly' | 'monthly';
  weekDays?: number[];
  monthDays?: number[];
  sortOrder?: number;
}
export interface UpdateTaskTemplateRequest {
  name?: string;
  defaultPoints?: number;
  isDaily?: boolean;
  frequency?: 'daily' | 'weekly' | 'monthly';
  weekDays?: number[];
  monthDays?: number[];
  isActive?: boolean;
  sortOrder?: number;
}

// 任务实例
export interface TaskListQuery {
  childId: string;
  date?: string;
  /** 日期区间查询（用于日历/历史） */
  startDate?: string;
  endDate?: string;
  status?: TaskStatus;
  type?: TaskType;
}
export interface TaskListResponse {
  items: TaskInstance[];
  total: number;
}
export interface CreateHomeworkTaskRequest {
  childId: string;
  name: string;
  subject?: string;
  points: number;
  deadline?: string;
  /** 截止日后的顺延天数（遇周末/节假日） */
  extendDays?: number;
  taskDate: string;
}
export interface SubmitTaskRequest {
  completionNote?: string;
}
export interface ReviewTaskRequest {
  approved: boolean;
  rejectReason?: string;
  finalPoints?: number;
}
export interface DeleteTaskRequest {
  id: string;
}

/** 编辑作业任务（任务实例字段） */
export interface UpdateHomeworkTaskRequest {
  name?: string;
  subject?: string | null;
  points?: number;
  deadline?: string | null;
  extendDays?: number;
  taskDate?: string;
  /** 目标型任务：目标值 / 单位 */
  targetValue?: number | null;
  unit?: string | null;
}

/** 新建目标型任务 */
export interface CreateGoalTaskRequest {
  childId: string;
  name: string;
  points: number;
  /** 目标值（如 100） */
  targetValue: number;
  /** 单位（可选，如 个 / 页 / 分钟） */
  unit?: string;
  /** 截止日期（可选，不填则不限时间） */
  deadline?: string;
  extendDays?: number;
  taskDate: string;
}

/** 目标型任务记录进度 */
export interface GoalProgressRequest {
  /** 增量，可为负（撤销） */
  delta: number;
}

// 积分流水
export interface PointTransactionListQuery {
  childId: string;
  page?: number;
  pageSize?: number;
}
export interface PointTransactionListResponse {
  items: PointTransaction[];
  total: number;
  page: number;
  pageSize: number;
}
export interface AdjustPointsRequest {
  childId: string;
  changeAmount: number;
  reason: string;
}

// 奖励
export interface RewardListResponse {
  items: Reward[];
}
export interface CreateRewardRequest {
  name: string;
  pointsRequired: number;
  description?: string;
  imageUrl?: string;
  sortOrder?: number;
  frequency?: RewardFrequency;
  limitCount?: number | null;
  limitPoints?: number | null;
  rewardType?: RewardType;
  allowanceAmount?: number | null;
}
export interface UpdateRewardRequest {
  name?: string;
  pointsRequired?: number;
  description?: string;
  imageUrl?: string;
  isActive?: boolean;
  sortOrder?: number;
  frequency?: RewardFrequency;
  limitCount?: number | null;
  limitPoints?: number | null;
  rewardType?: RewardType;
  allowanceAmount?: number | null;
}

/** 某孩子在当前周期内对某奖励的兑换用量 */
export interface RewardUsage {
  rewardId: string;
  frequency: RewardFrequency;
  /** 已用兑换次数（含待审核） */
  count: number;
  /** 已用积分（含待审核） */
  points: number;
  limitCount: number | null;
  limitPoints: number | null;
  periodStart: string;
  periodEnd: string;
}
export interface RewardUsageResponse {
  items: RewardUsage[];
}

// ==================== 零花钱 ====================

export type AllowanceTransactionType = 'income' | 'spend' | 'adjust';
export type AllowanceRequestStatus = 'pending' | 'approved' | 'rejected';

export interface AllowanceTransaction {
  id: string;
  childId: string;
  /** 变动金额（分），正=收入 负=支出 */
  changeAmount: number;
  balanceAfter: number;
  type: AllowanceTransactionType;
  relatedType: string | null;
  relatedId: string | null;
  reason: string | null;
  createdAt: string;
}

export interface AllowanceTransactionListResponse {
  items: AllowanceTransaction[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AllowanceRequest {
  id: string;
  childId: string;
  /** 申请金额（分） */
  amount: number;
  purpose: string | null;
  status: AllowanceRequestStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface AllowanceRequestListResponse {
  items: AllowanceRequest[];
}

export interface CreateAllowanceRequest {
  childId: string;
  /** 申请金额（分） */
  amount: number;
  purpose?: string;
}

export interface ReviewAllowanceRequest {
  approved: boolean;
  reviewNote?: string;
}

// ==================== 家长提醒 ====================

export interface AppNotification {
  id: string;
  familyId: string;
  childId: string | null;
  /** task_submitted | redemption_created | allowance_requested */
  type: string;
  title: string;
  body: string | null;
  relatedType: string | null;
  relatedId: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationListResponse {
  items: AppNotification[];
  unreadCount: number;
}

export interface AdjustAllowanceRequest {
  childId: string;
  /** 变动金额（分），正=增加 负=减少 */
  changeAmount: number;
  reason: string;
}

// 兑换
export interface RedemptionListQuery {
  childId?: string;
  status?: RedemptionStatus;
}
export interface RedemptionListResponse {
  items: Redemption[];
}
export interface CreateRedemptionRequest {
  rewardId: string;
  childId: string;
}
export interface ReviewRedemptionRequest {
  approved: boolean;
  reviewNote?: string;
}

// AI 设置
export interface AiSettingResponse {
  setting: AiSetting | null;
}
export interface UpdateAiSettingRequest {
  apiUrl?: string;
  apiKey?: string;
  modelName?: string;
  imageApiUrl?: string;
  imageApiKey?: string;
  imageModelName?: string;
  isEnabled?: boolean;
}

// AI 识别
export interface AiRecognizeTextRequest {
  childId: string;
  content: string;
}
export interface AiRecognizeImageRequest {
  childId: string;
  imageUrls: string[];
}
export interface AiRecognizeResponse {
  suggestions: HomeworkSuggestion[];
  logId: string;
  notConfigured?: boolean;
}
export interface AiTestConnectionResponse {
  success: boolean;
  message: string;
}

// 作业建议
export interface HomeworkSuggestionListResponse {
  items: HomeworkSuggestion[];
}
export interface ConfirmSuggestionsRequest {
  suggestionIds: string[];
  childId: string;
  /** 编辑已有任务时传入：把建议关联到该任务，不新建任务 */
  taskId?: string;
}
export interface UpdateSuggestionRequest {
  subject?: string;
  content?: string;
  quantity?: number;
  suggestedPoints?: number;
  deadline?: string;
  extendDays?: number;
  subtasks?: Array<{
    id?: string;
    content: string;
    points?: number;
    sortOrder: number;
  }>;
}

export interface CreateSuggestionRequest {
  childId: string;
  subject: string;
  content: string;
  quantity?: number;
  suggestedPoints: number;
  deadline?: string;
  extendDays?: number;
  subtasks?: Array<{
    content: string;
    points?: number;
    sortOrder: number;
  }>;
}

export interface ToggleSubtaskRequest {
  childId: string;
  isCompleted: boolean;
}

// 报表
export interface ReportStatsResponse {
  lastWeekCompletedTasks: number;
  dailyTaskCompletionRate: number;
  totalPointsEarned: number;
  totalRedemptions: number;
  weeklyTrend: Array<{
    week: string;
    points: number;
    completionRate: number;
  }>;
}

// 每日任务生成（内部接口）
export interface GenerateDailyTasksRequest {
  childId: string;
  date: string;
}

// ==================== 登录 / 角色 ====================

export type UserRole = 'parent' | 'child';

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  familyId: string;
  childId: string | null;
  displayName: string;
}

export interface AuthConfigResponse {
  /** 是否启用了应用级登录页 */
  loginEnabled: boolean;
}

export interface AuthMeResponse {
  user: AuthUser;
  /** 孩子账号对应的孩子信息 */
  child?: Child;
  /** 家长账号可看到家庭邀请码 */
  family?: { id: string; name: string; inviteCode: string | null };
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  displayName?: string;
  role: UserRole;
  /** 孩子注册必填：家庭邀请码 */
  inviteCode?: string;
  familyName?: string;
}
