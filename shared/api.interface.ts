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

export type TaskType = 'daily' | 'homework';
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
  finalPoints: number | null;
  deadline: string | null;
  taskDate: string;
  status: TaskStatus;
  submitTime: string | null;
  rejectReason: string | null;
  completionNote: string | null;
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

export interface Reward {
  id: string;
  familyId: string;
  name: string;
  pointsRequired: number;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
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
}
export interface UpdateRewardRequest {
  name?: string;
  pointsRequired?: number;
  description?: string;
  imageUrl?: string;
  isActive?: boolean;
  sortOrder?: number;
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
}
export interface UpdateSuggestionRequest {
  subject?: string;
  content?: string;
  quantity?: number;
  suggestedPoints?: number;
  deadline?: string;
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
