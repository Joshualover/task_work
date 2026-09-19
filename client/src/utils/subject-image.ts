import type { TaskInstance } from '@shared/api.interface';

/**
 * 各科目作业卡片的背景图。
 */
export const SUBJECT_IMAGES: Record<string, string> = {
  英语: 'https://copyright.bdstatic.com/vcg/creative/9014cbae6aac0e3ead9157e7eb9f78ff.jpg@wm_1,k_cGljX2JqaHdhdGVyLmpwZw==',
  数学: 'https://pic.rmb.bdstatic.com/bjh/240905/cbce368779dbaa12df80e230e5a14f0056.jpeg',
  语文: 'https://p7.itc.cn/q_70/images03/20210115/c02f3673fb68487280a56409fef9b89f.jpeg',
};

/** 按科目（或任务名）匹配背景图 */
export function subjectImage(
  subject?: string | null,
  name?: string | null,
): string | null {
  const s = (subject ?? '').trim();
  if (SUBJECT_IMAGES[s]) return SUBJECT_IMAGES[s];
  const n = name ?? '';
  for (const key of Object.keys(SUBJECT_IMAGES)) {
    if (n.includes(key)) return SUBJECT_IMAGES[key];
  }
  return null;
}

/**
 * 作业任务卡片的背景样式：科目背景图 + 半透明白色蒙层，保证原有文字/按钮可读。
 * 非作业任务或未匹配到科目时返回 undefined（保持原样）。
 */
export function taskCardStyle(
  task: Pick<TaskInstance, 'type'> & {
    subject?: string | null;
    name?: string | null;
  },
): Record<string, string> | undefined {
  if (task.type !== 'homework') return undefined;
  const url = subjectImage(task.subject, task.name);
  if (!url) return undefined;
  return {
    backgroundImage: `linear-gradient(rgba(255,255,255,0.86), rgba(255,255,255,0.86)), url("${url}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
}
