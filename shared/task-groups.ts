/**
 * 任务分组的纯逻辑：客户端渲染与回归脚本共用同一份定义。
 *
 * 为什么放在 shared/ 而不是组件里：分组规则是这套 UI 的核心语义，
 * 内联在 .vue 里就只有浏览器能验证它——scripts/test-progress-grouping.mjs
 * 需要用真实接口数据跑同一个函数；若在脚本里另写一份规则，两处必然漂移。
 */
import type { TaskInstance, TaskStatus, TaskType } from './api.interface';

// ==================== 按任务类型 ====================

export type TaskCategoryKey = 'daily' | 'homework' | 'habit' | 'goal';

/** 任务分类定义（数组顺序即分组顺序） */
export const TASK_CATEGORIES: ReadonlyArray<{
  key: TaskCategoryKey;
  label: string;
  emoji: string;
}> = [
  { key: 'daily', label: '必要任务', emoji: '📌' },
  { key: 'homework', label: '作业任务', emoji: '📚' },
  { key: 'habit', label: '习惯任务', emoji: '🔁' },
  { key: 'goal', label: '目标型任务', emoji: '🎯' },
];

/** 卡片类型徽标文案：与分组标题共用同一份定义，避免两处漂移 */
export function taskCategoryLabel(type: TaskType): string {
  return TASK_CATEGORIES.find((c) => c.key === type)?.label ?? '作业任务';
}

/** 卡片类型徽标配色（与分组 emoji 语义一致） */
export function taskCategoryBadgeClass(type: TaskType): string {
  if (type === 'daily') return 'bg-orange-100 text-orange-600';
  if (type === 'habit') return 'bg-green-100 text-green-600';
  if (type === 'goal') return 'bg-purple-100 text-purple-600';
  return 'bg-blue-100 text-blue-600';
}

// ==================== 按完成情况 ====================

/**
 * 全部任务状态（运行时可用的一份）。
 * `Record<TaskStatus, true>` 字面量是编译期穷尽性检查：TaskStatus 新增成员而这里
 * 漏写时 tsc 会直接报错；数组由它派生，于是回归脚本能断言「每个状态恰好落在一档」，
 * 而不必在脚本里再抄一份状态清单。
 */
const STATUS_EXHAUSTIVE: Record<TaskStatus, true> = {
  pending: true,
  submitted: true,
  completed: true,
  overdue: true,
  rejected: true,
};

export const TASK_STATUSES = Object.keys(STATUS_EXHAUSTIVE) as TaskStatus[];

export type GroupMode = 'type' | 'progress';

export const GROUP_MODE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'type', label: '按任务类型' },
  { value: 'progress', label: '按完成情况' },
];

/**
 * 完成程度分档（数组顺序即分组顺序）。
 * 中间态 submitted（孩子已提交、等家长审核）单独成档——对孩子来说「交了」和
 * 「家长已确认」是两回事，混在一起会让人以为积分已到账。
 */
export const PROGRESS_BUCKETS: ReadonlyArray<{
  key: string;
  label: string;
  emoji: string;
  statuses: readonly TaskStatus[];
  hint: string;
}> = [
  {
    key: 'todo',
    label: '未完成',
    emoji: '⏳',
    statuses: ['pending', 'overdue', 'rejected'],
    hint: '待完成 / 已逾期 / 已驳回',
  },
  {
    key: 'reviewing',
    label: '待家长确认',
    emoji: '📮',
    statuses: ['submitted'],
    hint: '已提交，等家长确认后发积分',
  },
  {
    key: 'done',
    label: '已完成',
    emoji: '✅',
    statuses: ['completed'],
    hint: '家长已确认，积分已到账',
  },
];

/** 逾期任务排在最前（与页面既有顺序一致） */
export function sortOverdueFirst(tasks: TaskInstance[]): TaskInstance[] {
  return [
    ...tasks.filter((t) => t.status === 'overdue'),
    ...tasks.filter((t) => t.status !== 'overdue'),
  ];
}

export interface TaskGroup {
  key: string;
  label: string;
  emoji: string;
  tasks: TaskInstance[];
  /** 分组标题右侧的说明文案 */
  metaText: string;
}

/**
 * 生成要渲染的分组（空分组已剔除）。
 * 类型筛选在两种分组方式下都先生效：先缩小任务集，再分组。
 */
export function buildTaskGroups(
  tasks: TaskInstance[],
  opts: { mode: GroupMode; category?: string },
): TaskGroup[] {
  const { mode, category = 'all' } = opts;
  const scoped =
    category === 'all' ? tasks : tasks.filter((t) => t.type === category);

  const groups: TaskGroup[] =
    mode === 'progress'
      ? PROGRESS_BUCKETS.map((b) => ({
          key: b.key,
          label: b.label,
          emoji: b.emoji,
          tasks: scoped.filter((t) => b.statuses.includes(t.status)),
          metaText: b.hint,
        }))
      : TASK_CATEGORIES.map((c) => {
          const items = scoped.filter((t) => t.type === c.key);
          const done = items.filter((t) => t.status === 'completed').length;
          return {
            key: c.key,
            label: c.label,
            emoji: c.emoji,
            tasks: items,
            metaText: `${done}/${items.length} 完成`,
          };
        });

  return groups.filter((g) => g.tasks.length > 0);
}
