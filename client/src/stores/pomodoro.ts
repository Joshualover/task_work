import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export type PomodoroMode = 'work' | 'short' | 'long';

const STORAGE_KEY = 'tw_pomodoro_v1';

const DEFAULT_DURATIONS: Record<PomodoroMode, number> = {
  work: 25,
  short: 5,
  long: 15,
};

/** 上海时区的今天 */
function todayStr(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 简单提示音（无需音频资源） */
function beep(): void {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
    osc.start();
    osc.stop(ctx.currentTime + 0.72);
    window.setTimeout(() => void ctx.close(), 900);
  } catch {
    /* 忽略音频异常 */
  }
}

function notify(title: string, body: string): void {
  try {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  } catch {
    /* 忽略 */
  }
}

function requestNotifyPermission(): void {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  } catch {
    /* 忽略 */
  }
}

export const usePomodoroStore = defineStore('pomodoro', () => {
  const durations = ref<Record<PomodoroMode, number>>({ ...DEFAULT_DURATIONS });
  const mode = ref<PomodoroMode>('work');
  const running = ref(false);
  /** 运行中的结束时间戳（ms）；暂停时为 null */
  const endAt = ref<number | null>(null);
  /** 暂停时的剩余秒数 */
  const pausedRemaining = ref<number>(DEFAULT_DURATIONS.work * 60);
  const now = ref<number>(Date.now());
  const completedCount = ref(0);
  const countDate = ref(todayStr());
  const focusTaskId = ref<string>('');
  const focusTaskName = ref<string>('');

  const totalSeconds = computed(() => durations.value[mode.value] * 60);
  const remainingSeconds = computed(() => {
    if (running.value && endAt.value != null) {
      return Math.max(0, Math.ceil((endAt.value - now.value) / 1000));
    }
    return pausedRemaining.value;
  });
  const progress = computed(() => {
    const total = totalSeconds.value;
    if (total <= 0) return 0;
    return Math.min(1, Math.max(0, 1 - remainingSeconds.value / total));
  });

  let ticker: number | null = null;

  function ensureTicker(): void {
    if (ticker != null) return;
    ticker = window.setInterval(() => {
      now.value = Date.now();
      if (running.value && endAt.value != null && now.value >= endAt.value) {
        completeSession(true);
      }
    }, 250);
  }

  function stopTicker(): void {
    if (ticker != null) {
      window.clearInterval(ticker);
      ticker = null;
    }
  }

  function rollDate(): void {
    const t = todayStr();
    if (t !== countDate.value) {
      countDate.value = t;
      completedCount.value = 0;
      save();
    }
  }

  /** 结束当前一轮；countIt=true 表示自然走完（计入番茄数） */
  function completeSession(countIt: boolean): void {
    const finishedMode = mode.value;
    running.value = false;
    endAt.value = null;

    if (countIt && finishedMode === 'work') {
      rollDate();
      completedCount.value += 1;
    }

    // 切到下一轮：专注 → 休息（每 4 个番茄一次长休息）；休息 → 专注
    if (finishedMode === 'work') {
      mode.value = completedCount.value > 0 && completedCount.value % 4 === 0 ? 'long' : 'short';
    } else {
      mode.value = 'work';
    }
    pausedRemaining.value = durations.value[mode.value] * 60;
    stopTicker();

    if (countIt) {
      beep();
      if (finishedMode === 'work') {
        notify('🍅 番茄完成！', '休息一下吧～');
      } else {
        notify('休息结束', '继续专注吧！');
      }
    }
    save();
  }

  function start(): void {
    rollDate();
    requestNotifyPermission();
    if (pausedRemaining.value <= 0) pausedRemaining.value = totalSeconds.value;
    endAt.value = Date.now() + pausedRemaining.value * 1000;
    now.value = Date.now();
    running.value = true;
    ensureTicker();
  }

  function pause(): void {
    if (!running.value) return;
    pausedRemaining.value = remainingSeconds.value;
    running.value = false;
    endAt.value = null;
    stopTicker();
  }

  function toggle(): void {
    if (running.value) pause();
    else start();
  }

  function reset(): void {
    running.value = false;
    endAt.value = null;
    pausedRemaining.value = totalSeconds.value;
    stopTicker();
  }

  function skip(): void {
    completeSession(false);
  }

  function setMode(next: PomodoroMode): void {
    mode.value = next;
    running.value = false;
    endAt.value = null;
    pausedRemaining.value = durations.value[next] * 60;
    stopTicker();
  }

  function setDuration(m: PomodoroMode, minutes: number): void {
    const value = Math.max(1, Math.min(180, Math.floor(minutes) || 1));
    durations.value[m] = value;
    if (mode.value === m && !running.value) pausedRemaining.value = value * 60;
    save();
  }

  function setFocus(id: string, name: string): void {
    focusTaskId.value = id;
    focusTaskName.value = name;
    save();
  }

  function save(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          durations: durations.value,
          completedCount: completedCount.value,
          countDate: countDate.value,
          focusTaskId: focusTaskId.value,
          focusTaskName: focusTaskName.value,
        }),
      );
    } catch {
      /* 忽略 */
    }
  }

  function load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Partial<{
        durations: Record<PomodoroMode, number>;
        completedCount: number;
        countDate: string;
        focusTaskId: string;
        focusTaskName: string;
      }>;
      if (data.durations) {
        durations.value = { ...DEFAULT_DURATIONS, ...data.durations };
      }
      completedCount.value = data.completedCount ?? 0;
      countDate.value = data.countDate ?? todayStr();
      focusTaskId.value = data.focusTaskId ?? '';
      focusTaskName.value = data.focusTaskName ?? '';
      pausedRemaining.value = durations.value.work * 60;
      rollDate();
    } catch {
      /* 忽略 */
    }
  }

  load();

  return {
    durations,
    mode,
    running,
    completedCount,
    focusTaskId,
    focusTaskName,
    totalSeconds,
    remainingSeconds,
    progress,
    start,
    pause,
    toggle,
    reset,
    skip,
    setMode,
    setDuration,
    setFocus,
  };
});
